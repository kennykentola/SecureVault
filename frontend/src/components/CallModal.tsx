import React from 'react';
import { PhoneOff, Mic, Video, MicOff, VideoOff, ChevronDown, Users, Clock, ShieldCheck } from 'lucide-react';
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
    const ringingAudioRef = React.useRef<AudioContext | null>(null);
    const ringingIntervalRef = React.useRef<number | null>(null);

    const playRingingSound = React.useCallback(() => {
        if (ringingAudioRef.current) return;
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            ringingAudioRef.current = ctx;

            const playTone = () => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.5);
            };

            playTone();
            ringingIntervalRef.current = window.setInterval(playTone, 2000);
        } catch (e) {
            console.warn("Audio context failed", e);
        }
    }, []);

    const stopRingingSound = React.useCallback(() => {
        if (ringingIntervalRef.current) {
            window.clearInterval(ringingIntervalRef.current);
            ringingIntervalRef.current = null;
        }
        if (ringingAudioRef.current) {
            ringingAudioRef.current.close();
            ringingAudioRef.current = null;
        }
    }, []);

    React.useEffect(() => {
        if ((callState.isIncoming || callState.isOutgoing) && !callState.isActive) {
            playRingingSound();
        } else {
            stopRingingSound();
        }
        return () => stopRingingSound();
    }, [callState.isIncoming, callState.isOutgoing, callState.isActive, playRingingSound, stopRingingSound]);
    const [micMuted, setMicMuted] = React.useState(false);
    const [cameraOff, setCameraOff] = React.useState(false);
    const [localVideoReady, setLocalVideoReady] = React.useState(false);
    const [remoteVideoReady, setRemoteVideoReady] = React.useState(false);
    const pollTimers = React.useRef<Map<HTMLVideoElement, number>>(new Map());

    const attachStream = React.useCallback(async (video: HTMLVideoElement | null, stream: MediaStream | null, isLocal: boolean = false) => {
        if (!video) return;
        
        // Prevent redundant resets which cause flickering and AbortErrors
        if (video.srcObject === stream && stream !== null) {
            if (video.paused) {
                try {
                    await video.play();
                } catch (e) {
                    console.warn(`[CallModal] Failed to play existing stream on ${isLocal ? 'local' : 'remote'} video`, e);
                }
            }
            
            // Critical: Still check if we need to mark it as ready
            if (video.videoWidth > 0 && video.videoHeight > 0) {
                if (isLocal) setLocalVideoReady(true);
                else setRemoteVideoReady(true);
            }
            return;
        }

        console.log(`[CallModal] Attaching ${isLocal ? 'local' : 'remote'} stream with ${stream?.getTracks().length || 0} tracks`);
        
        if (!stream) {
            video.srcObject = null;
            if (isLocal) setLocalVideoReady(false);
            else setRemoteVideoReady(false);
            return;
        }

        try {
            video.srcObject = stream;
            video.muted = isLocal; // Local always muted
            video.playsInline = true;
            video.autoplay = true;

            const markReady = () => {
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                    console.log(`[CallModal] ${isLocal ? 'Local' : 'Remote'} video READY: ${video.videoWidth}x${video.videoHeight}`);
                    if (isLocal) setLocalVideoReady(true);
                    else setRemoteVideoReady(true);
                    return true;
                }
                return false;
            };

            video.onloadedmetadata = () => {
                markReady();
                video.play().catch(e => console.warn("Auto-play failed", e));
            };
            
            video.onplaying = () => markReady();
            video.onresize = () => markReady();

            // Aggressive polling for up to 5 seconds to catch frames
            let attempts = 0;
            const checkInt = setInterval(() => {
                attempts++;
                if (markReady() || attempts > 20) {
                    clearInterval(checkInt);
                }
            }, 250);

            await video.play().catch(err => {
                console.warn(`[CallModal] Initial play() catch for ${isLocal ? 'local' : 'remote'}:`, err);
            });
        } catch (err) {
            console.error(`[CallModal] Error attaching ${isLocal ? 'local' : 'remote'} stream:`, err);
        }
    }, []);

    // Clean up polling timers on unmount
    React.useEffect(() => {
        const timers = pollTimers.current;
        return () => {
            timers.forEach(id => window.clearInterval(id));
            timers.clear();
        };
    }, []);

    React.useLayoutEffect(() => {
        const video = localVideoRef.current;
        if (!video) return;
        attachStream(video, callState.localStream, true);
    }, [attachStream, callState.localStream]);

    React.useLayoutEffect(() => {
        const video = remoteVideoRef.current;
        if (!video) return;
        // Correcting arguments: remote stream is NOT local video
        attachStream(video, callState.remoteStream, false);

        // Fallback: If remote video is not ready within 2 seconds of call being active,
        // re-verify track availability and try playing again.
        const timer = setTimeout(() => {
            if (callState.isActive && !remoteVideoReady && callState.remoteStream) {
                const hasVideo = callState.remoteStream.getVideoTracks().length > 0;
                console.log(`[CallModal] Video recovery check: hasVideoTracks=${hasVideo}`);
                if (hasVideo && video.paused) {
                    video.play().catch(e => console.warn("Recovery play failed", e));
                }
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [attachStream, callState.remoteStream, callState.isActive, remoteVideoReady]);

    React.useEffect(() => {
        const audio = remoteAudioRef.current;
        if (!audio) return;

        audio.srcObject = callState.remoteStream;
        audio.muted = false;

        if (callState.remoteStream) {
            audio.play().catch(e => console.warn("Remote audio playback failed", e));
        } else if (!audio.paused) {
            audio.pause();
        }
    }, [callState.remoteStream]);

    React.useEffect(() => {
        // Only start timer if the call is ACTIVE and not ringing/connecting
        const isActuallyActive = callState.isActive && !callState.isIncoming && !callState.isOutgoing;
        
        if (!isActuallyActive) {
            setElapsedSeconds(0);
            return;
        }

        const timer = window.setInterval(() => {
            setElapsedSeconds(prev => prev + 1);
        }, 1000);

        return () => window.clearInterval(timer);
    }, [callState.isActive, callState.isIncoming, callState.isOutgoing]);

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
    const hasRemoteStream = callState.callType === 'video' && !!callState.remoteStream;
    const hasLocalStream = callState.callType === 'video' && !!callState.localStream;
    const showRemoteVideo = hasRemoteStream && remoteVideoReady;
    const showLocalVideo = hasLocalStream && localVideoReady;

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

                    <div className="flex-1 flex items-center justify-center px-4 sm:px-8 pb-28 lg:pb-6 pt-2">
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
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="w-full h-[90vh] max-w-6xl relative flex flex-col"
                                >
                                    <div className="absolute top-0 left-0 right-0 z-[130] p-6 flex items-center justify-between pointer-events-none">
                                        <div className="flex flex-col gap-1 pointer-events-auto">
                                            <div className="flex items-center gap-2 text-white/90">
                                                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                                                <span className="text-xs font-black uppercase tracking-widest">Secure E2EE Session</span>
                                            </div>
                                            <h2 className="text-xl font-black text-white">{displayName}</h2>
                                            <div className="flex items-center gap-2 text-white/60 text-[11px] font-bold">
                                                <Clock className="w-3 h-3" />
                                                <span>{formatTime(elapsedSeconds)}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 pointer-events-auto">
                                            <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                Live
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex-1 relative rounded-[2.5rem] overflow-hidden border border-white/10 bg-slate-950 shadow-2xl">
                                        <div className={`absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.1),transparent_50%)] ${showRemoteVideo ? 'opacity-0' : 'opacity-100'}`} />
                                        <video
                                            ref={remoteVideoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ${showRemoteVideo ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-105 blur-2xl'}`}
                                        />
                                        {!showRemoteVideo && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center z-10">
                                                <div className="relative mb-8">
                                                    <RingPulse />
                                                    <div className="relative z-10 w-32 h-32 rounded-full bg-linear-to-tr from-primary-600 via-cyan-500 to-emerald-400 flex items-center justify-center shadow-2xl">
                                                        {callState.callType === 'video' ? <Video className="w-14 h-14 text-white" /> : <Mic className="w-14 h-14 text-white" />}
                                                    </div>
                                                </div>
                                                <p className="text-sm font-bold text-white/60 max-w-xs leading-relaxed">
                                                    {elapsedSeconds < 8 ? "Establishing end-to-end encrypted link..." : "Waiting for video feed. Ensure permissions are granted."}
                                                </p>
                                                {elapsedSeconds > 12 && (
                                                    <motion.button 
                                                        whileHover={{ scale: 1.05 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        onClick={() => {
                                                            const v = remoteVideoRef.current;
                                                            if (v) { v.load(); v.play().catch(() => {}); }
                                                        }}
                                                        className="mt-6 px-6 py-2.5 bg-white/10 hover:bg-white/20 rounded-full text-xs font-black uppercase tracking-widest border border-white/10 transition-all"
                                                    >
                                                        Reload Feed
                                                    </motion.button>
                                                )}
                                            </div>
                                        )}
                                        {hasLocalStream && (
                                            <motion.div 
                                                drag
                                                dragConstraints={{ left: -400, right: 0, top: 0, bottom: 400 }}
                                                dragElastic={0.1}
                                                whileDrag={{ scale: 1.05, zIndex: 50 }}
                                                className="absolute top-8 right-8 w-32 sm:w-48 aspect-video bg-black/40 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/20 shadow-2xl cursor-grab active:cursor-grabbing z-40 group"
                                            >
                                                <video
                                                    ref={localVideoRef}
                                                    autoPlay
                                                    playsInline
                                                    muted
                                                    className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-300 ${showLocalVideo && !cameraOff ? 'opacity-100' : 'opacity-0'}`}
                                                />
                                                <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                                <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/40 rounded-md text-[9px] font-black uppercase tracking-widest text-white/80">
                                                    You
                                                </div>
                                                {cameraOff && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                                                        <VideoOff className="w-6 h-6 text-white/40" />
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </div>
                                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[130] flex items-center gap-4 px-8 py-5 bg-slate-900/40 backdrop-blur-2xl rounded-full border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                                        <motion.button
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => {
                                                if (callState.localStream) {
                                                    const audioTrack = callState.localStream.getAudioTracks()[0];
                                                    if (audioTrack) {
                                                        audioTrack.enabled = micMuted;
                                                        setMicMuted(!micMuted);
                                                    }
                                                }
                                            }}
                                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${micMuted ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-white/10 text-white hover:bg-white/20'}`}
                                        >
                                            {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                                        </motion.button>
                                        <motion.button
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => {
                                                if (callState.localStream) {
                                                    const videoTrack = callState.localStream.getVideoTracks()[0];
                                                    if (videoTrack) {
                                                        videoTrack.enabled = cameraOff;
                                                        setCameraOff(!cameraOff);
                                                    }
                                                }
                                            }}
                                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${cameraOff ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-white/10 text-white hover:bg-white/20'}`}
                                        >
                                            {cameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                                        </motion.button>
                                        <div className="w-px h-8 bg-white/10 mx-2" />
                                        <motion.button
                                            whileHover={{ scale: 1.1, rotate: 135 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={onEnd}
                                            className="w-14 h-14 rounded-full bg-red-600 text-white flex items-center justify-center shadow-xl shadow-red-600/30 border border-red-500"
                                        >
                                            <PhoneOff className="w-6 h-6" />
                                        </motion.button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
