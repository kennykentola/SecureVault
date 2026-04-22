import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Trash2 } from 'lucide-react';
import { databases, storage, APPWRITE_CONFIG } from '../lib/appwrite';
import { Query } from 'appwrite';
import { HybridEncryptor } from '../crypto/encryptor';
import { KeyManager } from '../crypto/keyManager';
import { useAuth } from '../context/AuthContext';

interface StatusViewerProps {
    isOpen: boolean;
    onClose: () => void;
    statuses: any[];
    initialIndex: number;
    user: any;
    onViewed: (statusId: string) => void;
    onDeleted?: () => void;
}

export const StatusViewer: React.FC<StatusViewerProps> = ({ 
    isOpen, onClose, statuses, initialIndex, user, onViewed, onDeleted
}) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [progress, setProgress] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [decryptedContent, setDecryptedContent] = useState<{ url?: string, text?: string }>({});
    const [isLoading, setIsLoading] = useState(false);
    const { privateKey } = useAuth();
    const progressRef = useRef<number>(0);
    const timerRef = useRef<any>(null);

    const DURATION = 5000; // 5 seconds per status

    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(initialIndex);
            loadStatus(statuses[initialIndex]);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isPaused && isOpen) {
            startTimer();
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [currentIndex, isPaused, isOpen]);

    const startTimer = () => {
        clearInterval(timerRef.current);
        setProgress(0);
        progressRef.current = 0;
        
        timerRef.current = setInterval(() => {
            progressRef.current += 100 / (DURATION / 50);
            setProgress(progressRef.current);
            
            if (progressRef.current >= 100) {
                handleNext();
            }
        }, 50);
    };

    const loadStatus = async (status: any) => {
        if (!status) return;
        setIsLoading(true);
        setDecryptedContent({});
        console.log(`[Security] Loading status ${status.$id} from user ${status.user_id}. Current viewer: ${user.$id}`);
        try {
            // 1. Fetch the Status Symmetric Key for this user
            // In a real implementation, we would fetch the key from 'status_keys'
            // For this demo, let's assume we have a way to decrypt it.
            // Simplified: All statuses in this demo use a shared temporary key or 
            // if it's "MY" status, we use our own key.
            
            let statusKey: CryptoKey | null = null;
            const isOwner = status.user_id === user.$id || status.poster_id === user.$id;
            
            // 1. If we are the owner, prioritize using our local status key directly
            if (isOwner) {
                try {
                    console.log("[Security] Owner detected. Retrieving local status key.");
                    statusKey = await KeyManager.getStatusKey();
                } catch (e) {
                    console.warn("[Security] Local status key recovery failed, will attempt shared record check.", e);
                }
            }

            // 2. Fetch encrypted status key shared with US (works for self too if local key missing)
            if (!statusKey) {
                try {
                    if (!privateKey) throw new Error("VAULT_LOCKED");

                    const keyRes = await databases.listDocuments(
                        APPWRITE_CONFIG.DATABASE_ID, 
                        "status_keys", 
                        [
                            Query.equal('poster_id', status.user_id),
                            Query.equal('recipient_id', user.$id),
                            Query.orderDesc('created_at'),
                            Query.limit(1)
                        ]
                    );
                    
                    if (keyRes.documents.length > 0) {
                        const encryptedSharedKey = keyRes.documents[0].encrypted_key;
                        const decryptedSharedKeyB64 = await HybridEncryptor.decryptKeyWithRSA(
                            encryptedSharedKey, 
                            privateKey
                        );
                        statusKey = await KeyManager.importSecretKey(decryptedSharedKeyB64);
                    }
                } catch (err: any) {
                    console.error("Failed to retrieve shared status key", err);
                    if (err.message === "VAULT_LOCKED") {
                        setDecryptedContent({ text: "Vault Locked: Unlock to decrypt intelligence." });
                        setIsLoading(false);
                        return;
                    }
                }
            }

            if (!statusKey) {
                 setDecryptedContent({ text: "Agent: Decryption protocol failed (Key Not Shared or Missing)." });
                 setIsLoading(false);
                 return;
            }

            if (status.type === 'text') {
                try {
                    const text = await HybridEncryptor.decryptSymmetric(
                        JSON.parse(status.text_content), 
                        statusKey
                    );
                    setDecryptedContent({ text });
                } catch {
                    setDecryptedContent({ text: "Agent: Decryption protocol failed." });
                }
            } else {
                // Media decryption
                const fileUrl = `${APPWRITE_CONFIG.ENDPOINT}/storage/buckets/${APPWRITE_CONFIG.BUCKET_ID}/files/${status.content_url}/view?project=${APPWRITE_CONFIG.PROJECT_ID}`;
                // In a true E2EE, we would fetch the blob and decrypt it.
                // For this UI demo, we'll display the media.
                setDecryptedContent({ url: fileUrl });
            }
            
            onViewed(status.$id);
        } catch (e) {
            console.error("Status load failed", e);
        }
        setIsLoading(false);
    };

    const handleDeleteStatus = async () => {
        const currentId = statuses[currentIndex].$id;
        const currentUrl = statuses[currentIndex].content_url;
        
        if (!window.confirm("Broadcast Termination: Delete this artifact permanently?")) return;
        
        try {
            // 1. Delete media file if exists
            if (currentUrl) {
                await storage.deleteFile(APPWRITE_CONFIG.BUCKET_ID, currentUrl);
                console.log("[Security] Artifact media purged from storage.");
            }
            
            // 2. Delete document
            await databases.deleteDocument(APPWRITE_CONFIG.DATABASE_ID, "statuses", currentId);
            console.log("[Security] Artifact record deleted.");
            
            // 3. Close or Move to next
            if (statuses.length === 1) {
                onClose();
            } else {
                handleNext();
            }
            
            if (onDeleted) onDeleted();
        } catch (e) {
            console.error("Deletion protocol failed", e);
            alert("Failed to delete status.");
        }
    };

    const handleNext = () => {
        if (currentIndex < statuses.length - 1) {
            const next = currentIndex + 1;
            setCurrentIndex(next);
            loadStatus(statuses[next]);
        } else {
            onClose();
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            const prev = currentIndex - 1;
            setCurrentIndex(prev);
            loadStatus(statuses[prev]);
        }
    };

    if (!isOpen) return null;

    const currentStatus = statuses[currentIndex];

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-200 bg-black flex flex-col items-center justify-center"
            >
                {/* Progress Bars */}
                <div className="absolute top-4 left-4 right-4 z-10 flex gap-1.5">
                    {statuses.map((_, i) => (
                        <div key={i} className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden">
                            <motion.div 
                                className="h-full bg-white"
                                initial={{ width: 0 }}
                                animate={{ 
                                    width: i < currentIndex ? '100%' : (i === currentIndex ? `${progress}%` : '0%') 
                                }}
                                transition={{ duration: i === currentIndex ? 0.05 : 0 }}
                            />
                        </div>
                    ))}
                </div>

                {/* Header */}
                <div className="absolute top-10 left-4 right-4 z-10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/20 overflow-hidden flex items-center justify-center font-bold text-white">
                            {currentStatus.userName?.[0]}
                        </div>
                        <div>
                            <p className="text-sm font-black text-white">{currentStatus.userName || 'Identity Masked'}</p>
                            <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest">
                                {new Date(currentStatus.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {currentStatus.user_id === user.$id && (
                            <button 
                                onClick={handleDeleteStatus}
                                className="p-2 hover:bg-red-500/20 rounded-full text-red-400 transition-colors"
                                title="Delete Status"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div 
                    className="w-full h-full flex items-center justify-center"
                    onMouseDown={() => setIsPaused(true)}
                    onMouseUp={() => setIsPaused(false)}
                    onTouchStart={() => setIsPaused(true)}
                    onTouchEnd={() => setIsPaused(false)}
                >
                    {isLoading ? (
                        <Loader2 className="w-12 h-12 text-white animate-spin" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            {currentStatus.type === 'text' ? (
                                <div 
                                    className="w-full h-full flex items-center justify-center p-12 text-center"
                                    style={{ backgroundColor: currentStatus.background_color || '#3b82f6' }}
                                >
                                    <h2 className="text-3xl font-black text-white leading-tight italic">
                                        {decryptedContent.text || 'Protocol Decoding...'}
                                    </h2>
                                </div>
                            ) : currentStatus.type === 'image' ? (
                                <img src={decryptedContent.url} className="max-w-full max-h-full object-contain" alt="" />
                            ) : (
                                <video src={decryptedContent.url} autoPlay muted playsInline className="max-w-full max-h-full" />
                            )}
                        </div>
                    )}
                </div>

                {/* Navigation Overlays */}
                <div className="absolute inset-y-0 left-0 w-1/4 z-20" onClick={(e) => { e.stopPropagation(); handlePrev(); }} />
                <div className="absolute inset-y-0 right-0 w-1/4 z-20" onClick={(e) => { e.stopPropagation(); handleNext(); }} />

                {/* Footer Caption & Reply */}
                <div className="absolute bottom-4 left-0 right-0 p-8 flex flex-col items-center gap-4 bg-linear-to-t from-black to-transparent">
                    {currentStatus.caption && !isLoading && !isPaused && (
                        <p className="text-white text-sm font-medium leading-relaxed mb-4 max-w-lg">
                            {currentStatus.caption}
                        </p>
                    )}
                    
                    <div className="w-full max-w-lg flex items-center gap-3 bg-white/10 backdrop-blur-md rounded-2xl p-2 border border-white/20">
                        <input 
                            type="text" 
                            placeholder="Reply to identity protocol..."
                            className="flex-1 bg-transparent border-none outline-none text-white text-sm px-4 py-2 placeholder:text-white/40"
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => setIsPaused(true)}
                            onBlur={() => setIsPaused(false)}
                            onKeyUp={(e) => {
                                if (e.key === 'Enter') {
                                    const target = e.target as HTMLInputElement;
                                    if (target.value.trim()) {
                                        // Logic to send message would go here
                                        alert("Intelligence transmitted as reply.");
                                        target.value = "";
                                        setIsPaused(false);
                                    }
                                }
                            }}
                        />
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
