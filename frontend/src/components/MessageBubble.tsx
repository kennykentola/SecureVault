import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Reply, Edit2, Trash2, Forward, ShieldAlert, FileText, 
    Download, Play, Pause, ChevronDown, X, Clock, ShieldCheck, Bug, Zap
} from 'lucide-react';
import { MessageStatus } from './MessageStatus';
import { storage } from '../lib/appwrite';
import { APPWRITE_CONFIG } from '../lib/appwrite';
import { HybridEncryptor } from '../crypto/encryptor';

interface MessageBubbleProps {
    msg: any;
    isOwn: boolean;
    onReply: () => void;
    onEdit: () => void;
    onDelete: (everyone: boolean) => void;
    onForward: () => void;
    onAddReaction: (emoji: string) => void;
    reactions: any[];
    status: 'sent' | 'delivered' | 'read';
    renderText: (text: string) => React.ReactNode;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
    msg, isOwn, onReply, onEdit, onDelete, onForward, onAddReaction, reactions, status, renderText
}) => {
    const isDeleted = msg.is_deleted;
    const isEdited = msg.is_edited;
    const [decryptedUrl, setDecryptedUrl] = React.useState<string | null>(null);
    const [isDecrypting, setIsDecrypting] = React.useState(false);
    const [isPlaying, setIsPlaying] = React.useState(false);
    const [showActionMenu, setShowActionMenu] = React.useState(false);
    const [showSecurityDetails, setShowSecurityDetails] = React.useState(false);
    const [tamperError, setTamperError] = React.useState<string | null>(null);
    const bubbleRef = React.useRef<HTMLDivElement>(null);
    const audioRef = React.useRef<HTMLAudioElement>(null);
    const longPressTimerRef = React.useRef<number | null>(null);
    const mediaType = msg.type || msg.mediaData?.type;
    const fileId = msg.fileId || msg.file_id || msg.mediaData?.fileId || msg.mediaData?.file_id;
    const fileName = msg.fileName || msg.filename || msg.mediaData?.fileName || msg.mediaData?.file_name;
    const iv = msg.iv || msg.mediaData?.iv || msg.mediaData?.iv_b64;
    const durationLabel = msg.duration || msg.mediaData?.duration;
    const rawKeyBase64 = msg.decryptedKeyBase64 || msg.mediaData?.decryptedKeyBase64;
    const localFile = msg.localFile instanceof File ? msg.localFile : null;
    const originalMimeType = msg.originalMimeType || msg.original_mime_type || msg.mediaData?.originalMimeType || msg.mediaData?.original_mime_type || localFile?.type;

    // Close menu when clicking away
    React.useEffect(() => {
        const handleClickOutside = (event: PointerEvent) => {
            if (bubbleRef.current && !bubbleRef.current.contains(event.target as Node)) {
                setShowActionMenu(false);
            }
        };
        document.addEventListener('pointerdown', handleClickOutside);
        return () => document.removeEventListener('pointerdown', handleClickOutside);
    }, []);

    React.useEffect(() => {
        return () => {
            if (longPressTimerRef.current) {
                window.clearTimeout(longPressTimerRef.current);
            }
            if (decryptedUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(decryptedUrl);
            }
        };
    }, [decryptedUrl]);

    const clearLongPress = React.useCallback(() => {
        if (longPressTimerRef.current) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    const startLongPress = React.useCallback(() => {
        if (!window.matchMedia('(pointer: coarse)').matches || isDeleted) return;
        clearLongPress();
        longPressTimerRef.current = window.setTimeout(() => {
            setShowActionMenu(true);
        }, 450);
    }, [clearLongPress, isDeleted]);

    const playAudio = React.useCallback(async () => {
        const audioEl = audioRef.current;
        if (!audioEl) return false;

        try {
            await audioEl.play();
            setIsPlaying(true);
            return true;
        } catch (error: any) {
            if (error?.name !== 'AbortError') {
                console.warn("Audio playback failed", error);
            }
            setIsPlaying(false);
            return false;
        }
    }, []);

    const handleMediaAction = async () => {
        if (decryptedUrl) {
            if (mediaType === 'voice') {
                if (isPlaying) {
                    audioRef.current?.pause();
                    setIsPlaying(false);
                } else {
                    await playAudio();
                }
            } else {
                const link = document.createElement('a');
                link.href = decryptedUrl;
                link.download = fileName || 'file';
                link.click();
            }
            return;
        }

        if (localFile) {
            const localUrl = URL.createObjectURL(localFile);
            setDecryptedUrl(localUrl);
            if (mediaType === 'voice') {
                setTimeout(() => {
                    void playAudio();
                }, 100);
            } else {
                const link = document.createElement('a');
                link.href = localUrl;
                link.download = fileName || localFile.name || 'file';
                link.click();
            }
            return;
        }

        if (!fileId || !iv || isDecrypting) return;

        setIsDecrypting(true);
        try {
            // 1. Download encrypted file
            const downloadUrl = storage.getFileDownload(APPWRITE_CONFIG.BUCKET_ID, fileId);
            const response = await fetch(downloadUrl.toString(), { credentials: 'include' });
            if (!response.ok) {
                throw new Error(`File download failed with status ${response.status}`);
            }
            const fileBlob = await response.blob();
            
            // 2. Import the wrapped key and decrypt it to get the file AES key
            if (!rawKeyBase64) throw new Error("No decryption key available");

            const rawKey = new Uint8Array(atob(rawKeyBase64).split('').map(c => c.charCodeAt(0)));
            const aesKey = await window.crypto.subtle.importKey(
                "raw", rawKey, { name: "AES-GCM" }, true, ["decrypt"]
            );

            // 3. Decrypt the blob
            const decryptedBlob = await HybridEncryptor.decryptFile(fileBlob, aesKey, iv, originalMimeType);
            const url = URL.createObjectURL(decryptedBlob);
            setDecryptedUrl(url);

            if (mediaType === 'voice') {
                setTimeout(() => {
                    void playAudio();
                }, 100);
            }
        } catch (e) {
            console.error("Decryption failed", e);
            alert("Could not decrypt file. Key might be missing.");
        } finally {
            setIsDecrypting(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${isOwn ? 'justify-end' : 'justify-start'}`}
        >
            <div
                ref={bubbleRef}
                onTouchStart={startLongPress}
                onTouchEnd={clearLongPress}
                onTouchCancel={clearLongPress}
                onContextMenu={(e) => {
                    e.preventDefault();
                    setShowActionMenu(true);
                }}
                className={`max-w-[75%] group relative ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}
            >
                <div className={`px-4 py-3 rounded-2xl shadow-sm relative transition-all ${
                    isDeleted ? 'bg-slate-100/10 text-slate-400 border border-slate-200/20 italic backdrop-blur-sm' :
                    isOwn ? 'bg-primary-600 text-white rounded-br-sm shadow-lg shadow-primary-600/10' : 'bg-[#FFF9E3] text-slate-900 rounded-bl-sm border border-[#FFF5CC] shadow-lg shadow-lemon-white/5'
                }`}>
                    <div className="flex flex-col gap-1 min-w-[80px]">
                        {/* Reply Header */}
                        {msg.reply_to && !isDeleted && (
                            <div className={`px-3 py-2 rounded-lg border-l-2 mb-2 ${isOwn ? 'bg-blue-700/50 border-blue-300' : 'bg-slate-50 border-slate-200'}`}>
                                <p className={`text-[10px] font-bold mb-0.5 ${isOwn ? 'text-blue-200' : 'text-blue-600'}`}>
                                    {msg.reply_to.sender_name}
                                </p>
                                <p className="text-xs truncate opacity-70 italic">{msg.reply_to.text || 'Voice/Media'}</p>
                            </div>
                        )}

                        {/* Content */}
                        {isDeleted ? (
                            <div className="flex items-center gap-2 py-0.5">
                                <ShieldAlert className="w-3.5 h-3.5 opacity-50" />
                                <span className="text-xs">This message was deleted.</span>
                            </div>
                        ) : msg.is_waiting ? (
                            <div className="flex items-center gap-3 py-1 text-slate-400">
                                <Clock className="w-4 h-4 animate-pulse" />
                                <span className="text-[11px] leading-tight italic">Waiting for this message. This may take a while.</span>
                            </div>
                        ) : msg.type === 'voice' ? (
                            <div className="flex items-center gap-3 py-1 min-w-[200px]">
                                <button 
                                    onClick={handleMediaAction}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                        isOwn ? 'bg-primary-500 hover:bg-primary-400' : 'bg-[#FFF5CC] hover:bg-[#FFF0B3]'
                                    }`}
                                >
                                    {isDecrypting ? (
                                        <div className={`w-4 h-4 border-2 border-t-transparent animate-spin rounded-full ${isOwn ? 'border-white' : 'border-blue-600'}`} />
                                    ) : isPlaying ? (
                                        <Pause className={`w-4 h-4 ${isOwn ? 'text-white' : 'text-slate-600'}`} />
                                    ) : (
                                        <Play className={`w-4 h-4 ml-0.5 ${isOwn ? 'text-white' : 'text-slate-600'}`} />
                                    )}
                                </button>
                                <div className="flex-1 space-y-1.5">
                                    <div className={`h-1.5 w-full rounded-full overflow-hidden ${isOwn ? 'bg-blue-700' : 'bg-slate-200'}`}>
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: isPlaying ? '100%' : '30%' }}
                                            transition={{ duration: parseFloat(msg.duration || "5") || 5 }}
                                            className={`h-full ${isOwn ? 'bg-white' : 'bg-blue-500'}`} 
                                        />
                                    </div>
                                    <div className="flex justify-between items-center px-0.5">
                                        <p className={`text-[9px] font-black uppercase tracking-tighter ${isOwn ? 'text-blue-100' : 'text-slate-400'}`}>
                                            Secure Voice Note
                                        </p>
                                        <span className={`text-[9px] font-black ${isOwn ? 'text-blue-200' : 'text-slate-500'}`}>{durationLabel ? (durationLabel.toString().includes(':') ? durationLabel : `0:0${durationLabel}`) : '0:05'}</span>
                                    </div>
                                </div>
                                {decryptedUrl && (
                                    <audio 
                                        ref={audioRef} 
                                        src={decryptedUrl} 
                                        onEnded={() => setIsPlaying(false)}
                                        playsInline
                                        preload="auto"
                                        className="hidden"
                                    />
                                )}
                            </div>
                        ) : msg.type === 'file' ? (
                            <button 
                                onClick={handleMediaAction}
                                className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${
                                    isOwn ? 'bg-primary-700/30 border-primary-400/30 hover:bg-primary-700/50' : 'bg-[#FFF9E3]/50 border-[#FFF5CC] hover:bg-[#FFF9E3]/80'
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isOwn ? 'bg-blue-500' : 'bg-blue-100'}`}>
                                    <FileText className={`w-5 h-5 ${isOwn ? 'text-white' : 'text-blue-600'}`} />
                                </div>
                                <div className="text-left min-w-0 flex-1">
                                    <p className={`text-xs font-bold truncate ${isOwn ? 'text-white' : 'text-slate-800'}`}>{msg.fileName}</p>
                                    <p className={`text-[10px] font-medium ${isOwn ? 'text-blue-200' : 'text-slate-400'}`}>
                                        {isDecrypting ? 'Decrypting...' : decryptedUrl ? 'Ready to Download' : 'Encrypted File'}
                                    </p>
                                </div>
                                <div className={`p-2 rounded-lg ${isOwn ? 'bg-blue-500/50' : 'bg-white shadow-sm'}`}>
                                    <Download className={`w-3.5 h-3.5 ${isOwn ? 'text-white' : 'text-slate-500'}`} />
                                </div>
                            </button>
                        ) : msg.gif_url ? (
                            <img src={msg.gif_url} alt="GIF" className="rounded-lg max-w-full shadow-lg border border-black/5" />
                        ) : (
                            <div className="space-y-1">
                                {tamperError ? (
                                    <div className="flex flex-col gap-3 p-4 bg-red-600/10 border border-red-500/30 rounded-2xl relative overflow-hidden group">
                                        {/* Binary Rain Animation */}
                                        <div className="absolute inset-0 opacity-20 pointer-events-none flex gap-1 overflow-hidden">
                                            {Array.from({ length: 15 }).map((_, i) => (
                                                <motion.div 
                                                    key={i}
                                                    initial={{ y: -50 }}
                                                    animate={{ y: 50 }}
                                                    transition={{ repeat: Infinity, duration: Math.random() * 2 + 1, ease: 'linear' }}
                                                    className="text-[6px] font-mono text-red-500 whitespace-nowrap"
                                                >
                                                    {Array.from({ length: 20 }).map(() => Math.random() > 0.5 ? '1' : '0').join('\n')}
                                                </motion.div>
                                            ))}
                                        </div>

                                        <div className="flex items-center gap-2 text-red-500 relative z-10">
                                            <ShieldAlert className="w-5 h-5 animate-bounce" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Integrity Violation</span>
                                        </div>
                                        <p className="text-[12px] leading-snug text-red-200/90 font-medium relative z-10">
                                            {tamperError}
                                        </p>
                                        <div className="flex items-center gap-2 pt-2 border-t border-red-500/20 relative z-10">
                                            <div className="flex-1 h-1 bg-red-950 rounded-full overflow-hidden">
                                                <motion.div 
                                                    initial={{ width: '0%' }}
                                                    animate={{ width: '100%' }}
                                                    className="h-full bg-red-500" 
                                                />
                                            </div>
                                            <span className="text-[8px] font-black text-red-500 uppercase">Bit Flip Detected</span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm leading-relaxed">{renderText(msg.text)}</p>
                                )}
                                {isEdited && <span className={`text-[8px] font-bold uppercase tracking-widest block text-right opacity-60`}>Edited</span>}
                            </div>
                        )}

                        {/* Security Details Panel */}
                        <AnimatePresence>
                            {showSecurityDetails && (
                                <motion.div 
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="mt-3 pt-3 border-t border-white/10 overflow-hidden"
                                >
                                    <div className="grid grid-cols-1 gap-2.5">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black uppercase tracking-tighter opacity-60">Visible Ciphertext (Base64)</p>
                                            <div className="p-2 bg-black/20 rounded font-mono text-[9px] break-all max-h-16 overflow-y-auto leading-tight">
                                                {msg.ciphertext || "N/A"}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-black uppercase tracking-tighter opacity-60">IV (Nonce)</p>
                                                <div className="p-1.5 bg-black/20 rounded font-mono text-[9px] truncate">
                                                    {msg.iv || "N/A"}
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-black uppercase tracking-tighter opacity-60">Method</p>
                                                <div className="p-1.5 bg-black/20 rounded font-mono text-[9px] truncate">
                                                    AES-256-CBC
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black uppercase tracking-tighter opacity-60">Integrity Hash (SHA-256)</p>
                                            <div className="p-1.5 bg-black/20 rounded font-mono text-[9px] break-all leading-tight">
                                                {msg.hash || "N/A"}
                                            </div>
                                        </div>
                                        {msg.latency && (
                                            <div className="flex justify-between items-center px-1">
                                                <p className="text-[9px] font-black uppercase tracking-tighter opacity-60">Crypto Speed</p>
                                                <div className="flex items-center gap-1.5">
                                                    <Zap className="w-3 h-3 text-yellow-500" />
                                                    <p className="text-[10px] font-bold text-green-400">{msg.latency.toFixed(3)}ms</p>
                                                </div>
                                            </div>
                                        )}
                                        {!isOwn && !tamperError && (
                                            <motion.button 
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={async () => {
                                                    setTamperError("CRITICAL: SHA-256 Hash Mismatch. The message ciphertext has been altered by an external actor (MITM). The bit-flip was detected and decryption was halted to protect your privacy.");
                                                }}
                                                className="w-full py-3 bg-red-600 text-white rounded-xl flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-red-600/30 border border-red-500"
                                            >
                                                <Bug className="w-4 h-4" /> Simulate Bit-Flip Attack
                                            </motion.button>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* WhatsApp-Style Chevron Trigger (Visible on Hover) */}
                    {!isDeleted && (
                        <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setShowActionMenu(!showActionMenu); }}
                            className={`absolute top-1 z-20 p-1.5 rounded-lg bg-white/80 backdrop-blur-sm border border-slate-100 shadow-sm transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-white text-slate-400 hover:text-primary-600 ${
                                isOwn ? 'right-2' : 'left-0 ml-[calc(100%-32px)]'
                            }`}
                        >
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showActionMenu ? 'rotate-180' : ''}`} />
                        </button>
                    )}

                    {/* Reactions Summary */}
                    <div className="absolute -bottom-2 right-1 flex gap-0.5">
                        {reactions?.map((r, ri) => (
                            <span key={ri} className="bg-white rounded-full px-1.5 py-0.5 text-[9px] shadow-sm border border-slate-100 animate-in zoom-in duration-200">{r.emoji}</span>
                        ))}
                    </div>

                    {/* Action Menu (Controlled by state) */}
                    <AnimatePresence>
                        {showActionMenu && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                className={`fixed inset-x-4 bottom-24 z-40 flex flex-col gap-1 md:absolute md:inset-x-auto md:bottom-full md:mb-2 ${isOwn ? 'md:right-0 md:left-auto' : 'md:left-0 md:right-auto'}`}
                            >
                                <div className="flex flex-col bg-white border border-slate-100 shadow-2xl rounded-2xl p-1.5 min-w-[180px] overflow-hidden">
                                    {/* Reactions list */}
                                    <div className="flex gap-1 p-1 mb-1.5 border-b border-slate-50 justify-between">
                                        {['👍', '❤️', '😂', '🔥', '😮', '😢'].map(emoji => (
                                            <button 
                                                key={emoji}
                                                onClick={() => { onAddReaction(emoji); setShowActionMenu(false); }}
                                                className="w-7 h-7 hover:bg-slate-50 rounded-lg flex items-center justify-center text-sm transition-transform hover:scale-125"
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                    
                                    {/* Action items */}
                                    <div className="flex flex-col gap-0.5">
                                        <button onClick={() => { onReply(); setShowActionMenu(false); }} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl text-left text-xs text-slate-600 font-bold transition-colors">
                                            <Reply className="w-3.5 h-3.5" /> Reply
                                        </button>
                                        <button onClick={() => { setShowSecurityDetails(!showSecurityDetails); setShowActionMenu(false); }} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl text-left text-xs text-slate-600 font-bold transition-colors">
                                            <ShieldCheck className="w-3.5 h-3.5" /> {showSecurityDetails ? 'Hide' : 'View'} Security Details
                                        </button>
                                        {isOwn && <button onClick={() => { onEdit(); setShowActionMenu(false); }} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl text-left text-xs text-slate-600 font-bold transition-colors">
                                            <Edit2 className="w-3.5 h-3.5" /> Edit Message
                                        </button>}
                                        <button onClick={() => { onForward(); setShowActionMenu(false); }} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-xl text-left text-xs text-slate-600 font-bold transition-colors">
                                            <Forward className="w-3.5 h-3.5" /> Forward
                                        </button>
                                        <div className="h-px bg-slate-50 my-1" />
                                        <button onClick={() => { onDelete(isOwn); setShowActionMenu(false); }} className="flex items-center gap-3 px-3 py-2 hover:bg-red-50 rounded-xl text-left text-xs text-red-500 font-bold transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" /> Delete for Me
                                        </button>
                                        {isOwn && (
                                            <button onClick={() => { onDelete(true); setShowActionMenu(false); }} className="flex items-center gap-3 px-3 py-2 hover:bg-red-50 rounded-xl text-left text-xs text-red-600 font-black transition-colors">
                                                <X className="w-3.5 h-3.5" /> Revoke Message
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer Status */}
                <div className={`flex items-center gap-1.5 px-1 py-0.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isOwn && !isDeleted && <MessageStatus status={status} />}
                </div>
            </div>
        </motion.div>
    );
};
