import { useEffect, useState, useRef, useCallback } from 'react';

export interface CallState {
    isIncoming: boolean;
    isOutgoing: boolean;
    isActive: boolean;
    remoteStream: MediaStream | null;
    localStream: MediaStream | null;
    caller: string | null;
    callerName: string | null;
    callType: 'voice' | 'video';
}

const INITIAL_CALL_STATE: CallState = {
    isIncoming: false,
    isOutgoing: false,
    isActive: false,
    remoteStream: null,
    localStream: null,
    caller: null,
    callerName: null,
    callType: 'voice'
};

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Free TURN servers from Open Relay (metered.ca)
    {
        urls: 'turn:a.relay.metered.ca:80',
        username: 'e8dd65b92f6de1aa0ccedc2e',
        credential: '6JFy/yDBkpJBnRW1',
    },
    {
        urls: 'turn:a.relay.metered.ca:80?transport=tcp',
        username: 'e8dd65b92f6de1aa0ccedc2e',
        credential: '6JFy/yDBkpJBnRW1',
    },
    {
        urls: 'turn:a.relay.metered.ca:443',
        username: 'e8dd65b92f6de1aa0ccedc2e',
        credential: '6JFy/yDBkpJBnRW1',
    },
    {
        urls: 'turns:a.relay.metered.ca:443?transport=tcp',
        username: 'e8dd65b92f6de1aa0ccedc2e',
        credential: '6JFy/yDBkpJBnRW1',
    },
];

/**
 * Send a WebRTC signaling message through the app's existing WebSocket.
 * The backend already routes 'offer', 'answer', and 'candidate' message types.
 */
type SignalSender = (message: any) => boolean;

export const useWebRTC = (
    userId: string | undefined,
    resolveDisplayName?: (userId: string | null | undefined) => string | null | undefined,
    sendWsMessage?: SignalSender,
    wsStatus?: string,
) => {
    const [callState, setCallState] = useState<CallState>(INITIAL_CALL_STATE);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const callStateRef = useRef<CallState>(INITIAL_CALL_STATE);
    const resolveDisplayNameRef = useRef(resolveDisplayName);
    const sendWsRef = useRef(sendWsMessage);
    const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const localStreamRef = useRef<MediaStream | null>(null);
    const signalQueueRef = useRef<any[]>([]);

    useEffect(() => {
        callStateRef.current = callState;
    }, [callState]);

    useEffect(() => {
        resolveDisplayNameRef.current = resolveDisplayName;
    }, [resolveDisplayName]);

    useEffect(() => {
        sendWsRef.current = sendWsMessage;
    }, [sendWsMessage]);

    // Flush signaling queue when WebSocket reconnects
    useEffect(() => {
        if (wsStatus === 'connected' && signalQueueRef.current.length > 0) {
            console.log(`[WebRTC] Reconnected. Flushing ${signalQueueRef.current.length} queued signals.`);
            const queue = [...signalQueueRef.current];
            signalQueueRef.current = [];
            queue.forEach(msg => {
                sendWsRef.current?.(msg);
            });
        }
    }, [wsStatus]);

    const sendSignal = useCallback((type: string, recipientId: string, payload: any) => {
        const msg = {
            type,
            recipient_id: recipientId,
            recipientId: recipientId,
            payload,
        };

        if (!sendWsRef.current || wsStatus !== 'connected') {
            console.warn(`[WebRTC] WebSocket not connected. Queuing ${type} signal.`);
            signalQueueRef.current.push(msg);
            return false;
        }

        const sent = sendWsRef.current(msg);
        if (!sent) {
            console.warn(`[WebRTC] Send failed. Queuing ${type} signal.`);
            signalQueueRef.current.push(msg);
        }
        return sent;
    }, [wsStatus]);

    const cleanupPeerConnection = useCallback(() => {
        if (pcRef.current) {
            pcRef.current.onicecandidate = null;
            pcRef.current.ontrack = null;
            pcRef.current.oniceconnectionstatechange = null;
            pcRef.current.close();
            pcRef.current = null;
        }
        pendingCandidatesRef.current = [];
    }, []);

    const endCall = useCallback(() => {
        const state = callStateRef.current;

        // Notify the other party
        if (state.caller && sendWsRef.current) {
            sendSignal('call_end', state.caller, { reason: 'hangup' });
        }

        cleanupPeerConnection();

        setCallState(prev => {
            if (prev.localStream) {
                prev.localStream.getTracks().forEach(t => t.stop());
            }
            if (prev.remoteStream) {
                prev.remoteStream.getTracks().forEach(t => t.stop());
            }
            return { ...INITIAL_CALL_STATE };
        });
        localStreamRef.current = null;
    }, [cleanupPeerConnection, sendSignal]);

    const createPeerConnection = useCallback((remoteId: string) => {
        cleanupPeerConnection();

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal('candidate', remoteId, {
                    candidate: event.candidate.toJSON(),
                });
            }
        };

        pc.ontrack = (event) => {
            console.log(`[WebRTC] Received remote track: ${event.track.kind}`, event.streams);
            
            setCallState(prev => {
                let stream = prev.remoteStream;
                if (!stream) {
                    stream = event.streams[0] || new MediaStream();
                }

                // Ensure the track is in our stream
                if (!stream.getTracks().find(t => t.id === event.track.id)) {
                    stream.addTrack(event.track);
                }

                // Monitor track state
                event.track.onunmute = () => {
                    console.log(`[WebRTC] Remote ${event.track.kind} track unmuted`);
                    // Force a re-render if needed
                    setCallState(p => ({ ...p, remoteStream: new MediaStream(stream!.getTracks()) }));
                };

                return {
                    ...prev,
                    isActive: true,
                    isOutgoing: false,
                    isIncoming: false,
                    remoteStream: new MediaStream(stream.getTracks()), // New instance to trigger React update
                };
            });
        };

        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log('ICE connection state:', state);
            if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                // Give 'disconnected' a grace period — ICE can recover
                if (state === 'disconnected') {
                    setTimeout(() => {
                        if (pc.iceConnectionState === 'disconnected') {
                            console.warn('ICE stayed disconnected — ending call.');
                            endCall();
                        }
                    }, 5000);
                } else if (state === 'failed' || state === 'closed') {
                    endCall();
                }
            }
        };

        return pc;
    }, [cleanupPeerConnection, sendSignal, endCall]);

    const getMediaStream = useCallback(async (type: 'voice' | 'video') => {
        const constraints: MediaStreamConstraints = {
            audio: true,
            video: type === 'video' ? { facingMode: { ideal: 'user' } } : false,
        };

        try {
            return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            if (type === 'video') {
                console.warn('Front camera failed, falling back to default video device.', error);
                return await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: true,
                });
            }
            throw error;
        }
    }, []);

    const startCall = useCallback(async (remoteId: string, type: 'voice' | 'video') => {
        if (!remoteId) return;

        if (remoteId === userId) {
            alert("You can't call your own device from this chat.");
            return;
        }

        if (!sendWsRef.current) {
            alert("Signaling connection is not ready. Please wait a moment and try again.");
            return;
        }

        const state = callStateRef.current;
        if (pcRef.current || state.isIncoming || state.isOutgoing || state.isActive) {
            console.warn("A call session is already active.");
            return;
        }

        try {
            const stream = await getMediaStream(type);
            stream.getTracks().forEach(t => {
                t.enabled = true;
                console.log(`[WebRTC] Local ${t.kind} track enabled: ${t.label}`);
            });
            localStreamRef.current = stream;

            const pc = createPeerConnection(remoteId);

            // Add local tracks to the connection
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            // Create and send offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            setCallState(prev => ({
                ...prev,
                isOutgoing: true,
                localStream: stream,
                caller: remoteId,
                callerName: resolveDisplayNameRef.current?.(remoteId) || remoteId,
                callType: type,
            }));

            sendSignal('offer', remoteId, {
                sdp: pc.localDescription?.toJSON(),
                video: type === 'video',
                call_type: type, // Explicit separation
                callerName: resolveDisplayNameRef.current?.(userId) || userId,
            });

        } catch (err: any) {
            console.error('Failed to start call', err);
            cleanupPeerConnection();
            alert(`Call failed: ${err.message || 'Unable to access camera/microphone.'}`);
        }
    }, [userId, getMediaStream, createPeerConnection, sendSignal, cleanupPeerConnection]);

    const answerCall = useCallback(async () => {
        const state = callStateRef.current;
        if (!state.isIncoming || !state.caller) return;

        try {
            const stream = await getMediaStream(state.callType);
            stream.getTracks().forEach(t => {
                t.enabled = true;
                console.log(`[WebRTC] Answerer ${t.kind} track enabled: ${t.label}`);
            });
            localStreamRef.current = stream;

            const pc = pcRef.current;
            if (!pc) {
                console.error('No peer connection found for incoming call');
                endCall();
                return;
            }

            // Add local tracks
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            // Create and send answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            sendSignal('answer', state.caller, {
                sdp: pc.localDescription?.toJSON(),
                call_type: state.callType, // Explicit separation
            });

            // Flush pending ICE candidates
            for (const candidate of pendingCandidatesRef.current) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.warn('Failed to add buffered ICE candidate:', e);
                }
            }
            pendingCandidatesRef.current = [];

            setCallState(prev => ({
                ...prev,
                isIncoming: false,
                isActive: true,
                localStream: stream,
            }));

        } catch (err: any) {
            console.error('Failed to answer call', err);
            alert(`Call failed: ${err.message || 'Unable to access camera/microphone.'}`);
            endCall();
        }
    }, [getMediaStream, sendSignal, endCall]);

    /**
     * Handle incoming WebRTC signaling messages from the WebSocket.
     * This should be called from the Dashboard's onMessage handler.
     */
    const handleSignalingMessage = useCallback(async (msg: any) => {
        const senderId = msg.sender_id;
        if (!senderId || senderId === userId) return;

        const type = msg.type;
        const payload = msg.payload || msg;

        if (type === 'offer') {
            // Incoming call — set up peer connection + remote description
            const callType = payload.video ? 'video' : 'voice';
            const callerName = payload.callerName || resolveDisplayNameRef.current?.(senderId) || senderId;

            // If already in a call, reject
            const state = callStateRef.current;
            if (state.isActive || state.isOutgoing || state.isIncoming) {
                sendSignal('call_end', senderId, { reason: 'busy' });
                return;
            }

            const pc = createPeerConnection(senderId);

            try {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            } catch (e) {
                console.error('Failed to set remote offer:', e);
                cleanupPeerConnection();
                return;
            }

            setCallState(prev => ({
                ...prev,
                isIncoming: true,
                caller: senderId,
                callerName,
                callType,
            }));

        } else if (type === 'answer') {
            const pc = pcRef.current;
            if (!pc) return;

            try {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            } catch (e) {
                console.error('Failed to set remote answer:', e);
            }

            // Flush any buffered candidates
            for (const candidate of pendingCandidatesRef.current) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.warn('Failed to add buffered ICE candidate:', e);
                }
            }
            pendingCandidatesRef.current = [];

        } else if (type === 'candidate') {
            const pc = pcRef.current;
            const candidate = payload.candidate;

            if (!candidate) return;

            if (!pc || !pc.remoteDescription) {
                // Buffer candidates that arrive before remote description is set
                pendingCandidatesRef.current.push(candidate);
                return;
            }

            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.warn('Failed to add ICE candidate:', e);
            }

        } else if (type === 'call_end') {
            // Remote party ended or rejected the call
            cleanupPeerConnection();
            setCallState(prev => {
                if (prev.localStream) prev.localStream.getTracks().forEach(t => t.stop());
                if (prev.remoteStream) prev.remoteStream.getTracks().forEach(t => t.stop());
                return { ...INITIAL_CALL_STATE };
            });
            localStreamRef.current = null;

            if (payload?.reason === 'busy') {
                alert('The person you are calling is currently on another call.');
            }
        }
    }, [userId, createPeerConnection, cleanupPeerConnection, sendSignal]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pcRef.current) {
                pcRef.current.onicecandidate = null;
                pcRef.current.ontrack = null;
                pcRef.current.oniceconnectionstatechange = null;
                pcRef.current.close();
                pcRef.current = null;
            }
            if (localStreamRef.current) {
                console.log("[WebRTC] Cleaning up local tracks...");
                localStreamRef.current.getTracks().forEach(t => {
                    t.stop();
                    t.enabled = false;
                });
                localStreamRef.current = null;
            }
        };
    }, []);

    return { callState, startCall, answerCall, endCall, handleSignalingMessage };
};
