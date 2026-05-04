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

export const useWebRTC = (userId: string | undefined, resolveDisplayName?: (userId: string | null | undefined) => string | null | undefined) => {
    const [peer, setPeer] = useState<Peer | null>(null);
    const [callState, setCallState] = useState<CallState>(INITIAL_CALL_STATE);

    const currentCall = useRef<MediaConnection | null>(null);
    const callStateRef = useRef<CallState>(INITIAL_CALL_STATE);
    const peerRef = useRef<Peer | null>(null);
    const resolveDisplayNameRef = useRef(resolveDisplayName);
    const initTimerRef = useRef<number | null>(null);
    const retryTimerRef = useRef<number | null>(null);

    const getVideoConstraints = useCallback((type: 'voice' | 'video') => {
        if (type !== 'video') return false;
        return {
            facingMode: { ideal: 'user' }
        } as MediaTrackConstraints;
    }, []);

    useEffect(() => {
        callStateRef.current = callState;
    }, [callState]);

    useEffect(() => {
        resolveDisplayNameRef.current = resolveDisplayName;
    }, [resolveDisplayName]);

    useEffect(() => {
        if (!userId) return;
        let isCancelled = false;

        const initPeer = () => {
            if (isCancelled || peerRef.current) return;

            const newPeer = new Peer(userId, {
                debug: 1,
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
                    // Our own peer ID is taken — retry with a delay
                    console.warn(`PeerJS ID ${userId} is already registered. Retrying in 2s...`);
                    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
                    retryTimerRef.current = window.setTimeout(() => {
                        if (isCancelled || newPeer.destroyed) return;
                        newPeer.destroy();
                        if (peerRef.current === newPeer) {
                            peerRef.current = null;
                            setPeer(null);
                        }
                        initPeer();
                    }, 2000);

                } else if (err.type === 'peer-unavailable') {
                    // Remote peer is offline or hasn't registered with PeerJS yet
                    alert('The person you are calling is not available right now.\nThey may be offline or have not opened the app.');
                    // End any outgoing call state cleanly
                    if (currentCall.current) {
                        currentCall.current.close();
                        currentCall.current = null;
                    }
                    setCallState(prev => {
                        if (prev.localStream) prev.localStream.getTracks().forEach(t => t.stop());
                        return { ...INITIAL_CALL_STATE };
                    });

                } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
                    // PeerJS does NOT auto-reconnect — we must trigger it ourselves
                    console.warn('PeerJS connection lost:', err.type, '— will attempt reconnect via disconnected handler.');
                    if (!newPeer.destroyed && !newPeer.disconnected) {
                        // Peer object is still connected; the disconnected event will fire next
                    } else if (!newPeer.destroyed) {
                        // Already disconnected — try an immediate reconnect
                        try {
                            newPeer.reconnect();
                        } catch (reconnectErr) {
                            console.warn('PeerJS reconnect() failed:', reconnectErr);
                        }
                    }

                } else {
                    // Unknown / fatal error
                    console.error('PeerJS fatal error:', err.type, err.message);
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
                    callerName: resolveDisplayNameRef.current?.(call.peer) || call.peer,
                    callType
                }));
                call.on('error', (err: any) => {
                    console.error('Incoming call failed', err);
                    endCall();
                });
                call.on('close', () => endCall());
                currentCall.current = call;
            });

            // 'disconnected' fires when the signaling WebSocket drops but the peer
            // is still usable — attempt reconnect with exponential backoff
            newPeer.on('disconnected', () => {
                if (isCancelled || peerRef.current !== newPeer) return;
                console.warn('PeerJS disconnected from signaling server — attempting reconnect...');
                let attempts = 0;
                const maxAttempts = 5;
                const tryReconnect = () => {
                    if (isCancelled || peerRef.current !== newPeer || newPeer.destroyed) return;
                    if (newPeer.open) {
                        console.log('PeerJS reconnected successfully.');
                        return;
                    }
                    if (attempts >= maxAttempts) {
                        console.warn('PeerJS reconnect failed after', maxAttempts, 'attempts. Doing full re-init...');
                        newPeer.destroy();
                        if (peerRef.current === newPeer) {
                            peerRef.current = null;
                            setPeer(null);
                        }
                        if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
                        retryTimerRef.current = window.setTimeout(() => {
                            if (!isCancelled) initPeer();
                        }, 2000);
                        return;
                    }
                    attempts++;
                    try {
                        newPeer.reconnect();
                    } catch (e) {
                        console.warn('PeerJS reconnect() threw:', e);
                    }
                    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
                    retryTimerRef.current = window.setTimeout(tryReconnect, Math.min(1000 * Math.pow(2, attempts - 1), 8000));
                };
                if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
                retryTimerRef.current = window.setTimeout(tryReconnect, 1000);
            });

            // 'close' fires when the peer is fully destroyed — do a fresh re-init
            newPeer.on('close', () => {
                if (peerRef.current === newPeer) {
                    peerRef.current = null;
                    setPeer(null);
                }
                // Auto re-init unless the component is unmounting
                if (!isCancelled) {
                    console.log('PeerJS peer closed. Re-initializing in 2s...');
                    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
                    retryTimerRef.current = window.setTimeout(() => {
                        if (!isCancelled) initPeer();
                    }, 2000);
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
                video: getVideoConstraints(type) || false
            }).catch(async (error) => {
                if (type !== 'video') throw error;
                console.warn('Front camera request failed, falling back to default video device.', error);
                return navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: true
                });
            });

            const call = peer.call(remoteId, stream, { metadata: { video: type === 'video' } });
            currentCall.current = call;

            setCallState(prev => ({
                ...prev,
                isOutgoing: true,
                localStream: stream,
                caller: remoteId,
                callerName: resolveDisplayNameRef.current?.(remoteId) || remoteId,
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
    }, [peer, userId, getVideoConstraints]);

    const answerCall = useCallback(async () => {
        if (!currentCall.current) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: callState.callType === 'video' ? { facingMode: { ideal: 'user' } } : false
            }).catch(async (error) => {
                if (callState.callType !== 'video') throw error;
                console.warn('Front camera request failed during answer, falling back to default video device.', error);
                return navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: true
                });
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
