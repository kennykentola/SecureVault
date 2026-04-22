import React from 'react';
import { PhoneOff, Mic, Video } from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';
import type { CallState } from '../hooks/useWebRTC';


interface CallModalProps {
    callState: CallState;
    onAnswer: () => void;
    onEnd: () => void;
}

export const CallModal: React.FC<CallModalProps> = ({ callState, onAnswer, onEnd }) => {
    const handleLocalVideoRef = (el: HTMLVideoElement | null) => {
        if (el && callState.localStream) {
            el.srcObject = callState.localStream;
            el.play().catch(e => console.warn("Local video playback failed", e));
        }
    };

    const handleRemoteVideoRef = (el: HTMLVideoElement | null) => {
        if (el && callState.remoteStream) {
            el.srcObject = callState.remoteStream;
            el.play().catch(e => console.warn("Remote video playback failed", e));
        }
    };

    if (!callState.isIncoming && !callState.isOutgoing && !callState.isActive) return null;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-0 inset-x-0 z-50 bg-slate-900/90 backdrop-blur-2xl border-b border-white/10 shadow-2xl overflow-hidden"
            >
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
                            callState.isActive ? 'bg-primary-600 animate-pulse' : 'bg-primary-500'
                        }`}>
                            {callState.callType === 'video' ? <Video className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white tracking-tight">
                                {callState.isIncoming ? 'Incoming Call...' : callState.isOutgoing ? 'Calling...' : 'Active Call'}
                            </h3>
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary-400">
                                {callState.caller || 'Encrypted Peer'} • {callState.callType}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {callState.isActive && (
                            <>
                                <div className="hidden md:flex items-center gap-2 mr-4 bg-black/20 rounded-xl p-1 pr-3">
                                    <div className="w-16 aspect-video bg-black rounded-lg overflow-hidden border border-white/10">
                                        <video ref={handleLocalVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                                    </div>
                                    <span className="text-[9px] font-bold text-white/50 uppercase">You</span>
                                </div>
                                <button className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-white transition-all"><Mic className="w-5 h-5" /></button>
                                <button className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-white transition-all"><Video className="w-5 h-5" /></button>
                            </>
                        )}
                        
                        {callState.isIncoming ? (
                            <div className="flex gap-2">
                                <button onClick={onEnd} className="px-6 py-2.5 bg-red-500 hover:bg-red-600 rounded-xl text-white text-xs font-bold transition-all shadow-lg shadow-red-500/20 flex items-center gap-2">
                                    <PhoneOff className="w-4 h-4" /> Decline
                                </button>
                                <button onClick={onAnswer} className="px-6 py-2.5 bg-green-500 hover:bg-green-600 rounded-xl text-white text-xs font-bold transition-all shadow-lg shadow-green-500/20 animate-pulse flex items-center gap-2">
                                    <Video className="w-4 h-4" /> Answer
                                </button>
                            </div>
                        ) : (
                            <button onClick={onEnd} className="px-6 py-2.5 bg-red-500 hover:bg-red-600 rounded-xl text-white text-xs font-bold transition-all shadow-lg shadow-red-500/20 flex items-center gap-2">
                                <PhoneOff className="w-4 h-4" /> End Call
                            </button>
                        )}
                    </div>
                </div>

                {/* PiP Video View for Active Video Calls */}
                {callState.isActive && callState.callType === 'video' && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-4 pt-0"
                    >
                        <div className="w-full max-w-sm ml-auto aspect-video bg-black rounded-2xl overflow-hidden border border-white/20 shadow-2xl relative">
                            <video ref={handleRemoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                            <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/40 backdrop-blur-md rounded-lg border border-white/10">
                                <p className="text-[9px] font-black text-white uppercase tracking-widest">{callState.caller}</p>
                            </div>
                        </div>
                    </motion.div>
                )}
                {/* Hidden Audio for Voice and Video Sync */}
                <audio ref={handleRemoteVideoRef} autoPlay playsInline />
            </motion.div>
        </AnimatePresence>
    );
};
