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
    onLogCall?: (targetId: string, type: 'voice' | 'video', direction: 'outgoing' | 'incoming' | 'missed' | 'cancelled') => void
) => {
    const [callState, setCallState] = useState<CallState>(INITIAL_CALL_STATE);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const callStateRef = useRef<CallState>(INITIAL_CALL_STATE);
    const resolveDisplayNameRef = useRef(resolveDisplayName);
    const sendWsRef = useRef(sendWsMessage);
    const onLogCallRef = useRef(onLogCall);
    const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const localStreamRef = useRef<MediaStream | null>(null);
    const signalQueueRef = useRef<any[]>([]);
    const callTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        onLogCallRef.current = onLogCall;
    }, [onLogCall]);

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

        if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
        }

        // Notify the other party
        if (state.caller && sendWsRef.current) {
            sendSignal('call_end', state.caller, { reason: 'hangup' });
        }

        // Log the call if it was outgoing but never answered (Cancelled/Missed)
        if (state.isOutgoing && !state.isActive && state.caller) {
            onLogCallRef.current?.(state.caller, state.callType, 'cancelled');
        }
        // If receiver declines an incoming call
        if (state.isIncoming && !state.isActive && state.caller) {
            onLogCallRef.current?.(state.caller, state.callType, 'incoming');
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
                const stream = event.streams[0] || (prev.remoteStream || new MediaStream());
                
                // If it's a new track, add it if not present
                if (!stream.getTracks().find(t => t.id === event.track.id)) {
                    stream.addTrack(event.track);
                }

                // Monitor track state
                event.track.onunmute = () => {
                    console.log(`[WebRTC] Remote ${event.track.kind} track unmuted`);
                    setCallState(p => ({ ...p, remoteStream: new MediaStream(stream.getTracks()) }));
                };

                event.track.onended = () => {
                    console.warn(`[WebRTC] Remote ${event.track.kind} track ended`);
                };

                return {
                    ...prev,
                    isActive: true,
                    remoteStream: new MediaStream(stream.getTracks()), 
                };
            });
        };

        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log(`[WebRTC] ICE Connection State: ${state}`);
            if (state === 'failed' || state === 'closed') {
                endCall();
            } else if (state === 'disconnected') {
                // Grace period for recovery
                const timeout = setTimeout(() => {
                    if (pc.iceConnectionState === 'disconnected') {
                        console.warn('[WebRTC] ICE stayed disconnected. Ending call.');
                        endCall();
                    }
                }, 8000);
                return () => clearTimeout(timeout);
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC] Peer Connection State: ${pc.connectionState}`);
            if (pc.connectionState === 'failed') {
                endCall();
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
            console.log(`[WebRTC] Requesting media stream: audio=true, video=${type === 'video'}`);
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log(`[WebRTC] Media stream acquired. Tracks: ${stream.getTracks().length}`);
            stream.getTracks().forEach(t => {
                console.log(`[WebRTC] Local track: ${t.kind} - ${t.label} (Enabled: ${t.enabled})`);
                t.enabled = true; // Ensure explicitly enabled
            });
            return stream;
        } catch (error) {
            if (type === 'video') {
                console.warn('[WebRTC] Front camera failed, falling back to default video device.', error);
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: true,
                });
                console.log(`[WebRTC] Fallback stream acquired. Tracks: ${stream.getTracks().length}`);
                return stream;
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

            // Auto-timeout after 60 seconds of ringing
            callTimeoutRef.current = window.setTimeout(() => {
                const currentState = callStateRef.current;
                if (currentState.isOutgoing && !currentState.isActive) {
                    console.log("[WebRTC] Call timed out - No answer.");
                    onLogCallRef.current?.(remoteId, type, 'missed');
                    endCall();
                }
            }, 60000);

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
            if (callTimeoutRef.current) {
                clearTimeout(callTimeoutRef.current);
                callTimeoutRef.current = null;
            }

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

            // Receiver logs an incoming call once answered
            onLogCallRef.current?.(state.caller, state.callType, 'incoming');

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

            // Receiver-side safety timeout: If no action after 65s, auto-end
            callTimeoutRef.current = window.setTimeout(() => {
                const currentState = callStateRef.current;
                if (currentState.isIncoming && !currentState.isActive) {
                    console.log("[WebRTC] Incoming call timed out.");
                    onLogCallRef.current?.(senderId, callType, 'missed');
                    endCall();
                }
            }, 65000);

        } else if (type === 'answer') {
            const pc = pcRef.current;
            if (!pc) return;

            try {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                
                if (callTimeoutRef.current) {
                    clearTimeout(callTimeoutRef.current);
                    callTimeoutRef.current = null;
                }

                // Mark call as active once the answer is accepted on the caller's side
                setCallState(prev => ({ 
                    ...prev, 
                    isActive: true, 
                    isOutgoing: false, 
                    isIncoming: false 
                }));

                // Caller logs an outgoing call once answered
                if (payload.sender_id || senderId) {
                    onLogCallRef.current?.(payload.sender_id || senderId, payload.call_type || 'video', 'outgoing');
                }
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
                console.log("[WebRTC] Buffering ICE candidate (Remote description not ready)");
                pendingCandidatesRef.current.push(candidate);
                return;
            }

            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                console.log("[WebRTC] ICE candidate added successfully");
            } catch (e) {
                console.warn('[WebRTC] Failed to add ICE candidate:', e);
            }

        } else if (type === 'call_end') {
            const state = callStateRef.current;
            
            // If we were receiving an incoming call and they ended it before we answered
            if (state.isIncoming && !state.isActive && state.caller) {
                onLogCallRef.current?.(state.caller, state.callType, 'missed');
            }

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
