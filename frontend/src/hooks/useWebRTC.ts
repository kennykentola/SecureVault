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

export const useWebRTC = (userId: string | undefined) => {
    const [peer, setPeer] = useState<Peer | null>(null);
    const [callState, setCallState] = useState<CallState>({
        isIncoming: false,
        isOutgoing: false,
        isActive: false,
        remoteStream: null,
        localStream: null,
        caller: null,
        callType: 'voice'
    });

    const currentCall = useRef<MediaConnection | null>(null);

    useEffect(() => {
        if (!userId) return;

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

        newPeer.on('open', (id) => {
            console.log('Peer connected with ID:', id);
        });

        newPeer.on('call', (call) => {
            // Incoming call
            const callType = call.metadata?.video ? 'video' : 'voice';
            setCallState(prev => ({
                ...prev,
                isIncoming: true,
                caller: call.peer,
                callType
            }));
            currentCall.current = call;
        });

        setPeer(newPeer);

        return () => {
            newPeer.destroy();
        };
    }, [userId]);

    const startCall = useCallback(async (remoteId: string, type: 'voice' | 'video') => {
        if (!peer) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: type === 'video'
            });

            const call = peer.call(remoteId, stream, { metadata: { video: type === 'video' } });
            
            setCallState(prev => ({
                ...prev,
                isOutgoing: true,
                localStream: stream,
                callType: type
            }));

            call.on('stream', (remoteStream: MediaStream) => {
                setCallState(prev => ({ ...prev, isActive: true, isOutgoing: false, remoteStream }));
            });

            call.on('close', () => endCall());
            currentCall.current = call;
        } catch (err: any) {
            console.error('Failed to get local stream', err);
            alert(`Call failed: Access to camera/microphone denied or failed. (${err.message})`);
        }
    }, [peer]);

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
                isIncoming: false,
                isOutgoing: false,
                isActive: false,
                remoteStream: null,
                localStream: null,
                caller: null,
                callType: 'voice'
            };
        });
    }, []);

    return { callState, startCall, answerCall, endCall };
};
