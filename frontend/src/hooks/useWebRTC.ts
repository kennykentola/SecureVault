import { useEffect, useState, useRef, useCallback } from 'react';
import { Peer } from 'peerjs';

// Define MediaConnection as any for now to bypass Vite/PeerJS export issues
type MediaConnection = any;

export interface CallState {
    isIncoming: boolean;
    isOutgoing: boolean;
    isActive: boolean;
    remoteStream: MediaStream | null;
    localStream: MediaStream | null;
    caller: string | null;
    callType: 'voice' | 'video';
}

const INITIAL_CALL_STATE: CallState = {
    isIncoming: false,
    isOutgoing: false,
    isActive: false,
    remoteStream: null,
    localStream: null,
    caller: null,
    callType: 'voice'
};

export const useWebRTC = (userId: string | undefined) => {
    const [peer, setPeer] = useState<Peer | null>(null);
    const [callState, setCallState] = useState<CallState>(INITIAL_CALL_STATE);

    const currentCall = useRef<MediaConnection | null>(null);
    const callStateRef = useRef<CallState>(INITIAL_CALL_STATE);
    const peerRef = useRef<Peer | null>(null);
    const initTimerRef = useRef<number | null>(null);
    const retryTimerRef = useRef<number | null>(null);

    useEffect(() => {
        callStateRef.current = callState;
    }, [callState]);

    useEffect(() => {
        if (!userId) return;
        let isCancelled = false;

        const initPeer = () => {
            if (isCancelled || peerRef.current) return;

            const newPeer = new Peer(userId, {
                debug: 3,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                    ]
                }
            });

            peerRef.current = newPeer;
            setPeer(newPeer);

            newPeer.on('open', (id) => {
                if (isCancelled || peerRef.current !== newPeer) {
                    if (!newPeer.destroyed) newPeer.destroy();
                    return;
                }
                console.log('Peer connected with ID:', id);
            });

            newPeer.on('error', (err) => {
                if (isCancelled || peerRef.current !== newPeer) return;
                console.error('PeerJS Error:', err.type, err);
                if (err.type === 'unavailable-id') {
                    console.warn(`ID ${userId} is taken. Retrying in 2 seconds...`);
                    if (retryTimerRef.current) {
                        window.clearTimeout(retryTimerRef.current);
                    }
                    retryTimerRef.current = window.setTimeout(() => {
                        if (isCancelled || newPeer.destroyed) return;
                        newPeer.destroy();
                        if (peerRef.current === newPeer) {
                            peerRef.current = null;
                            setPeer(null);
                        }
                        initPeer();
                    }, 2000);
                }
            });

            newPeer.on('call', (call) => {
                if (isCancelled || peerRef.current !== newPeer) return;
                // Incoming call
                const callType = call.metadata?.video ? 'video' : 'voice';
                setCallState(prev => ({
                    ...prev,
                    isIncoming: true,
                    caller: call.peer,
                    callType
                }));
                call.on('error', (err: any) => {
                    console.error('Incoming call failed', err);
                    endCall();
                });
                call.on('close', () => endCall());
                currentCall.current = call;
            });

            newPeer.on('close', () => {
                if (peerRef.current === newPeer) {
                    peerRef.current = null;
                    setPeer(null);
                }
            });

            return newPeer;
        };

        initTimerRef.current = window.setTimeout(() => {
            initPeer();
        }, 200);

        return () => {
            isCancelled = true;
            if (initTimerRef.current) {
                window.clearTimeout(initTimerRef.current);
                initTimerRef.current = null;
            }
            if (retryTimerRef.current) {
                window.clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
            const activePeer = peerRef.current;
            peerRef.current = null;
            if (activePeer && !activePeer.destroyed) {
                activePeer.destroy();
            }
            setPeer(null);
        };
    }, [userId]);

    const startCall = useCallback(async (remoteId: string, type: 'voice' | 'video') => {
        if (!remoteId) return;

        if (remoteId === userId) {
            alert("You can't call your own device from this chat.");
            return;
        }

        if (!peer || peer.destroyed || peer.disconnected || !peer.open) {
            alert("Call setup is still connecting. Please wait a moment and try again.");
            return;
        }

        if (currentCall.current || callStateRef.current.isIncoming || callStateRef.current.isOutgoing || callStateRef.current.isActive) {
            console.warn("A call session is already active.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: type === 'video'
            });

            const call = peer.call(remoteId, stream, { metadata: { video: type === 'video' } });
            currentCall.current = call;
            
            setCallState(prev => ({
                ...prev,
                isOutgoing: true,
                localStream: stream,
                caller: remoteId,
                callType: type
            }));

            call.on('stream', (remoteStream: MediaStream) => {
                setCallState(prev => ({ ...prev, isActive: true, isOutgoing: false, remoteStream }));
            });

            call.on('error', (err: any) => {
                console.error('Call connection failed', err);
                alert(`Call failed: ${err?.message || 'Unable to establish a secure media session.'}`);
                endCall();
            });

            call.on('close', () => endCall());
        } catch (err: any) {
            console.error('Failed to get local stream', err);
            alert(`Call failed: Access to camera/microphone denied or failed. (${err.message})`);
        }
    }, [peer, userId]);

    const answerCall = useCallback(async () => {
        if (!currentCall.current) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: callState.callType === 'video'
            });

            currentCall.current.answer(stream);
            setCallState(prev => ({
                ...prev,
                isIncoming: false,
                isActive: true,
                localStream: stream
            }));

            currentCall.current.on('stream', (remoteStream: MediaStream) => {
                setCallState(prev => ({ ...prev, remoteStream }));
            });

            currentCall.current.on('error', (err: any) => {
                console.error('Call connection failed', err);
                alert(`Call failed: ${err?.message || 'Unable to establish a secure media session.'}`);
                endCall();
            });

            currentCall.current.on('close', () => endCall());
        } catch (err: any) {
            console.error('Failed to get local stream', err);
            alert(`Call failed: Access to camera/microphone denied or failed. (${err.message})`);
        }
    }, [callState.callType]);

    const endCall = useCallback(() => {
        if (currentCall.current) {
            currentCall.current.close();
            currentCall.current = null;
        }
        
        setCallState(prev => {
            // Explicitly stop all tracks to release hardware
            if (prev.localStream) {
                prev.localStream.getTracks().forEach(t => t.stop());
            }
            if (prev.remoteStream) {
                prev.remoteStream.getTracks().forEach(t => t.stop());
            }
            
            return {
                ...INITIAL_CALL_STATE
            };
        });
    }, []);

    return { callState, startCall, answerCall, endCall };
};
