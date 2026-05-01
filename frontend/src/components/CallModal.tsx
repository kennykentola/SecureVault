import React from 'react';
import { PhoneOff, Mic, Video, MicOff, VideoOff, ChevronDown, Users, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CallState } from '../hooks/useWebRTC';

interface CallModalProps {
    callState: CallState;
    onAnswer: () => void;
    onEnd: () => void;
}

export const CallModal: React.FC<CallModalProps> = ({ callState, onAnswer, onEnd }) => {
    const localVideoRef = React.useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = React.useRef<HTMLVideoElement | null>(null);
    const remoteAudioRef = React.useRef<HTMLAudioElement | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
    const [micMuted, setMicMuted] = React.useState(false);
    const [cameraOff, setCameraOff] = React.useState(false);

    React.useEffect(() => {
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = callState.localStream || null;
            if (callState.localStream) {
                localVideoRef.current.play().catch(e => console.warn("Local video playback failed", e));
            }
        }
    }, [callState.localStream]);

    React.useEffect(() => {
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = callState.remoteStream || null;
            if (callState.remoteStream) {
                remoteVideoRef.current.play().catch(e => console.warn("Remote video playback failed", e));
            }
        }
    }, [callState.remoteStream]);

    React.useEffect(() => {
        if (remoteAudioRef.current) {
            const shouldUseAudioElement = callState.callType === 'voice';
            remoteAudioRef.current.srcObject = shouldUseAudioElement ? callState.remoteStream : null;
            if (shouldUseAudioElement && callState.remoteStream) {
                remoteAudioRef.current.play().catch(e => console.warn("Remote audio playback failed", e));
            }
        }
    }, [callState.callType, callState.remoteStream]);

    React.useEffect(() => {
        if (!callState.isActive) {
            setElapsedSeconds(0);
            return;
        }

        const timer = window.setInterval(() => {
            setElapsedSeconds(prev => prev + 1);
        }, 1000);

        return () => window.clearInterval(timer);
    }, [callState.isActive]);

    React.useEffect(() => {
        setMicMuted(false);
        setCameraOff(false);
    }, [callState.isIncoming, callState.isOutgoing, callState.callType, callState.caller]);

    if (!callState.isIncoming && !callState.isOutgoing && !callState.isActive) return null;

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const displayName = callState.callerName || callState.caller || 'Encrypted Peer';
    const primaryLabel = callState.isIncoming
        ? 'Incoming Call'
        : callState.isOutgoing
            ? 'Calling'
            : 'In Call';

    const statusLabel = callState.isIncoming
        ? 'Ringing'
        : callState.isOutgoing && !callState.isActive
            ? 'Connecting'
            : callState.isActive
                ? 'Encrypted'
                : '';
    const hasRemoteVideo = callState.callType === 'video' && !!callState.remoteStream;
    const hasLocalVideo = callState.callType === 'video' && !!callState.localStream;

    const handleSwipeDismiss = (_event: any, info: { offset: { y: number }, velocity: { y: number } }) => {
        const shouldDismiss = info.offset.y > 120 || info.velocity.y > 900;
        if (shouldDismiss) onEnd();
    };

    const RingPulse = () => (
        <div className="absolute inset-0">
            <motion.div
                className="absolute inset-0 rounded-full border border-cyan-300/25"
                animate={{ scale: [1, 1.18, 1.34], opacity: [0.65, 0.18, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
            />
            <motion.div
                className="absolute inset-2 rounded-full border border-emerald-300/25"
                animate={{ scale: [1, 1.12, 1.26], opacity: [0.55, 0.16, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut', delay: 0.35 }}
            />
            <motion.div
                className="absolute inset-4 rounded-full border border-white/10"
                animate={{ scale: [1, 1.08, 1.18], opacity: [0.4, 0.12, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut', delay: 0.7 }}
            />
        </div>
    );

    const StatusDots = () => (
        <span className="inline-flex items-center gap-1.5 align-middle">
            <motion.span
                className="w-1.5 h-1.5 rounded-full bg-cyan-300"
                animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
            />
            <motion.span
                className="w-1.5 h-1.5 rounded-full bg-emerald-300"
                animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.18 }}
            />
            <motion.span
                className="w-1.5 h-1.5 rounded-full bg-white"
                animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.36 }}
            />
        </span>
    );

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="fixed inset-0 z-[120] bg-slate-950 text-white overflow-hidden"
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.12}
                dragMomentum={false}
                onDragEnd={handleSwipeDismiss}
            >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_28%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.98))]" />

                <div className="relative h-full flex flex-col">
                    <div className="flex items-center justify-between px-4 sm:px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <button
                                onClick={onEnd}
                                className="w-11 h-11 rounded-full bg-white/8 hover:bg-white/14 border border-white/10 flex items-center justify-center transition-colors md:hidden"
                                aria-label="Close call"
                            >
                                <ChevronDown className="w-5 h-5" />
                            </button>
                            <div className="hidden md:flex w-11 h-11 rounded-full bg-white/8 border border-white/10 items-center justify-center">
                                {callState.callType === 'video' ? <Video className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.28em] text-cyan-300/90">
                                    {primaryLabel}
                                </p>
                                <h3 className="text-lg sm:text-xl font-bold tracking-tight truncate">
                                    {displayName}
                                </h3>
                                <div className="flex items-center gap-2 text-[11px] text-slate-300 mt-1">
                                    <Users className="w-3.5 h-3.5" />
                                    <span>{callState.callType === 'video' ? 'Secure video session' : 'Secure voice session'}</span>
                                    {callState.isActive && (
                                        <>
                                            <span className="text-white/30">-</span>
                                            <Clock className="w-3.5 h-3.5" />
                                            <span>{formatTime(elapsedSeconds)}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="hidden sm:flex items-center gap-2">
                            <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 text-[10px] font-black uppercase tracking-[0.2em]">
                                E2EE
                            </div>
                            {statusLabel && (
                                <div className="px-3 py-1.5 rounded-full bg-white/6 border border-white/10 text-slate-300 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                                    <StatusDots />
                                    <span>{statusLabel}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 flex items-center justify-center px-4 sm:px-8 pb-6 pt-2">
                        <AnimatePresence mode="wait">
                            {callState.isIncoming && (
                                <motion.div
                                    key="incoming"
                                    initial={{ opacity: 0, y: 24, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 24, scale: 0.98 }}
                                    className="w-full max-w-md text-center"
                                >
                                    <div className="relative mx-auto w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-white/6 border border-white/10 flex items-center justify-center shadow-2xl shadow-cyan-500/10">
                                        <RingPulse />
                                        <div className="relative z-10 w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-linear-to-tr from-primary-600 via-cyan-500 to-emerald-400 flex items-center justify-center">
                                            {callState.callType === 'video' ? <Video className="w-12 h-12 text-white" /> : <Mic className="w-12 h-12 text-white" />}
                                        </div>
                                    </div>
                                    <h2 className="mt-6 text-3xl sm:text-4xl font-black tracking-tight">
                                        {displayName}
                                    </h2>
                                    <p className="mt-2 text-sm sm:text-base text-slate-300">
                                        Incoming {callState.callType} call. Swipe down to dismiss or tap decline to ignore.
                                    </p>
                                    <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/6 border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                                        <StatusDots />
                                        <span>{statusLabel}</span>
                                    </div>
                                    <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
                                        <button
                                            onClick={onEnd}
                                            className="h-14 px-6 rounded-full bg-red-500 hover:bg-red-600 text-white font-bold flex items-center justify-center gap-3 shadow-lg shadow-red-500/20 transition-colors"
                                        >
                                            <PhoneOff className="w-5 h-5" />
                                            Decline
                                        </button>
                                        <button
                                            onClick={onAnswer}
                                            className="h-14 px-6 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20 transition-colors animate-pulse"
                                        >
                                            {callState.callType === 'video' ? <Video className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                                            Answer
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {callState.isOutgoing && !callState.isActive && (
                                <motion.div
                                    key="outgoing"
                                    initial={{ opacity: 0, y: 24, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 24, scale: 0.98 }}
                                    className="w-full max-w-md text-center"
                                >
                                    <div className="relative mx-auto w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-white/6 border border-white/10 flex items-center justify-center shadow-2xl shadow-cyan-500/10">
                                        <RingPulse />
                                        <div className="relative z-10 w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-linear-to-tr from-primary-600 via-cyan-500 to-emerald-400 flex items-center justify-center animate-pulse">
                                            {callState.callType === 'video' ? <Video className="w-12 h-12 text-white" /> : <Mic className="w-12 h-12 text-white" />}
                                        </div>
                                    </div>
                                    <h2 className="mt-6 text-3xl sm:text-4xl font-black tracking-tight">
                                        Calling {displayName}
                                    </h2>
                                    <p className="mt-2 text-sm sm:text-base text-slate-300">
                                        Secure {callState.callType} call in progress.
                                    </p>
                                    <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/6 border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                                        <StatusDots />
                                        <span>{statusLabel}</span>
                                    </div>
                                    <button
                                        onClick={onEnd}
                                        className="mt-8 h-14 px-6 rounded-full bg-red-500 hover:bg-red-600 text-white font-bold flex items-center justify-center gap-3 mx-auto shadow-lg shadow-red-500/20 transition-colors"
                                    >
                                        <PhoneOff className="w-5 h-5" />
                                        Cancel Call
                                    </button>
                                </motion.div>
                            )}

                            {callState.isActive && (
                                <motion.div
                                    key="active"
                                    initial={{ opacity: 0, y: 24 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 24 }}
                                    className="w-full max-w-6xl"
                                >
                                    <div className="grid gap-4 lg:grid-cols-[1fr_auto] items-stretch">
                                        <div className={`relative rounded-[2rem] overflow-hidden border border-white/10 bg-black shadow-[0_30px_80px_rgba(0,0,0,0.45)] ${callState.callType === 'video' ? 'min-h-[56vh] lg:min-h-[70vh]' : 'min-h-[46vh] lg:min-h-[62vh]'}`}>
                                            {hasRemoteVideo ? (
                                                <video
                                                    ref={remoteVideoRef}
                                                    autoPlay
                                                    playsInline
                                                    className="absolute inset-0 w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_30%),radial-gradient(circle_at_center,rgba(16,185,129,0.12),transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.9),rgba(15,23,42,0.98))]">
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                                                        {callState.callType === 'video' && (
                                                            <div className="relative mb-5 w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-white/6 border border-white/10 flex items-center justify-center shadow-2xl shadow-cyan-500/10">
                                                                <RingPulse />
                                                                <div className="relative z-10 w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-linear-to-tr from-primary-600 via-cyan-500 to-emerald-400 flex items-center justify-center">
                                                                    <Video className="w-12 h-12 sm:w-14 sm:h-14 text-white" />
                                                                </div>
                                                            </div>
                                                        )}
                                                        <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
                                                            {displayName}
                                                        </h2>
                                                        <p className="mt-2 text-sm sm:text-base text-slate-300 max-w-md">
                                                            Waiting for the video feed. If the screen stays dark, the other side may have video off or permissions blocked.
                                                        </p>
                                                        {hasLocalVideo && (
                                                            <div className="mt-6 relative w-full max-w-sm aspect-video bg-black/60 backdrop-blur-md rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                                                                <video
                                                                    ref={localVideoRef}
                                                                    autoPlay
                                                                    playsInline
                                                                    muted
                                                                    className={`w-full h-full object-cover scale-x-[-1] ${cameraOff ? 'opacity-0' : 'opacity-100'}`}
                                                                />
                                                                {!cameraOff && (
                                                                    <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 bg-black/40 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                                                        You
                                                                    </div>
                                                                )}
                                                                {cameraOff && (
                                                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                                                                        <VideoOff className="w-5 h-5 text-white/80" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {hasRemoteVideo && (
                                                <div className="absolute top-4 right-4 sm:top-5 sm:right-5 w-24 sm:w-32 aspect-video bg-black/60 backdrop-blur-md rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                                                    <video
                                                        ref={localVideoRef}
                                                        autoPlay
                                                        playsInline
                                                        muted
                                                        className={`w-full h-full object-cover scale-x-[-1] ${cameraOff ? 'opacity-0' : 'opacity-100'}`}
                                                    />
                                                    {!cameraOff && (
                                                        <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 bg-black/40 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                                            You
                                                        </div>
                                                    )}
                                                    {cameraOff && (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                                                            <VideoOff className="w-5 h-5 text-white/80" />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="lg:w-72 rounded-[2rem] border border-white/10 bg-white/5 backdrop-blur-2xl p-4 sm:p-5 flex flex-row lg:flex-col items-center lg:items-stretch gap-3 lg:gap-4">
                                            <div className="flex-1 min-w-0 text-left lg:text-center">
                                                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">Call Controls</p>
                                                <h4 className="mt-1 text-lg font-bold truncate">Manage audio and video</h4>
                                                <p className="mt-1 text-xs text-slate-300 leading-relaxed hidden lg:block">
                                                    Keep the call full screen, mute yourself, hide the camera, or end the session at any time.
                                                </p>
                                            </div>

                                            <div className="flex lg:flex-col gap-3 w-full lg:w-auto justify-end">
                                                <button
                                                    onClick={() => {
                                                        const nextMuted = !micMuted;
                                                        setMicMuted(nextMuted);
                                                        const tracks = callState.localStream?.getAudioTracks() || [];
                                                        tracks.forEach(track => {
                                                            track.enabled = !nextMuted;
                                                        });
                                                    }}
                                                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border transition-colors flex items-center justify-center ${micMuted ? 'bg-red-500/20 border-red-400/30 text-red-200' : 'bg-white/8 border-white/10 text-white hover:bg-white/12'}`}
                                                    aria-label="Toggle microphone"
                                                >
                                                    {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        const nextCameraOff = !cameraOff;
                                                        setCameraOff(nextCameraOff);
                                                        const tracks = callState.localStream?.getVideoTracks() || [];
                                                        tracks.forEach(track => {
                                                            track.enabled = !nextCameraOff;
                                                        });
                                                    }}
                                                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border transition-colors flex items-center justify-center ${cameraOff ? 'bg-red-500/20 border-red-400/30 text-red-200' : 'bg-white/8 border-white/10 text-white hover:bg-white/12'}`}
                                                    aria-label="Toggle camera"
                                                >
                                                    {cameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                                                </button>

                                                <button
                                                    onClick={onEnd}
                                                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-red-500 hover:bg-red-600 text-white border border-red-400/20 transition-colors flex items-center justify-center shadow-lg shadow-red-500/20"
                                                    aria-label="End call"
                                                >
                                                    <PhoneOff className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {callState.isActive && callState.callType === 'voice' && (
                        <audio ref={remoteAudioRef} autoPlay playsInline />
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
