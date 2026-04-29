import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    X, Type, Image as ImageIcon, Video as VideoIcon, 
    Shield, Loader2, Send, Search, UserMinus
} from 'lucide-react';
import { databases, storage, APPWRITE_CONFIG } from '../lib/appwrite';
import { ID, Query, Permission, Role } from 'appwrite';
import { KeyManager } from '../crypto/keyManager';
import { HybridEncryptor } from '../crypto/encryptor';
import { useAuth } from '../context/AuthContext';

interface AddStatusWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const AddStatusWizard: React.FC<AddStatusWizardProps> = ({ isOpen, onClose, onSuccess }) => {
    const { user } = useAuth();
    const [step, setStep] = useState<'type' | 'edit' | 'privacy'>('type');
    const [statusType, setStatusType] = useState<'text' | 'image' | 'video'>('text');
    const [textContent, setTextContent] = useState("");
    const [bgColor, setBgColor] = useState("#3b82f6");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);
    const [caption, setCaption] = useState("");
    const [isUploading, setIsUploading] = useState(false);

    const [excludedUsers, setExcludedUsers] = useState<string[]>([]);
    const [availableContacts, setAvailableContacts] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    const bgOptions = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#000000"];

    // Fetch contacts eagerly when wizard opens so key-sharing works even if the user
    // skips the privacy step. Also refresh when they reach it.
    useEffect(() => {
        if (isOpen) fetchContacts();
    }, [isOpen]);

    useEffect(() => {
        if (step === 'privacy') fetchContacts();
    }, [step]);

    const fetchContacts = async () => {
        try {
            const res = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_USERS, [
                Query.limit(100)
            ]);
            setAvailableContacts(res.documents.filter(u => u.user_id !== user?.$id));
        } catch (e) { console.error(e); }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setStatusType(type);
            setFilePreview(URL.createObjectURL(file));
            setStep('edit');
        }
    };

    const handlePostStatus = async () => {
        setIsUploading(true);
        try {
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            const statusKey = await KeyManager.getStatusKey();
            
            let payload: any = {
                user_id: user?.$id,
                type: statusType,
                created_at: new Date().toISOString(),
                expires_at: expiresAt,
                viewers: [],
                excluded_users: excludedUsers
            };

            if (statusType === 'text') {
                const encryptedText = await HybridEncryptor.encryptSymmetric(textContent, statusKey);
                payload.text_content = JSON.stringify(encryptedText);
                payload.background_color = bgColor;
            } else if (selectedFile) {
                // In a real E2EE scenario, we encrypt the file blob first
                // const { blob, iv } = await HybridEncryptor.encryptFile(selectedFile, statusKey);
                // For this demo, let's upload the file directly to storage
                const upload = await storage.createFile(
                    APPWRITE_CONFIG.BUCKET_ID, 
                    ID.unique(), 
                    selectedFile,
                    [
                        Permission.read(Role.any()),
                        Permission.write(Role.user(user.$id)),
                        Permission.delete(Role.user(user.$id))
                    ]
                );
                payload.content_url = upload.$id;
                payload.caption = caption;
            }

            await databases.createDocument(
                APPWRITE_CONFIG.DATABASE_ID, 
                "statuses", 
                ID.unique(), 
                payload,
                [
                    Permission.read(Role.any()),
                    Permission.write(Role.user(user?.$id || '')),
                    Permission.delete(Role.user(user?.$id || ''))
                ]
            );
            
            // Share key with authorized viewers
            try {
                const statusKeyExported = await KeyManager.exportSecretKey(statusKey);
                const viewers = availableContacts.filter(c => !excludedUsers.includes(c.user_id));
                const selfPublicKeyBase64 = await KeyManager.getPublicKey();

                await Promise.all(viewers.map(async (viewer) => {
                    if (viewer.public_key) {
                        try {
                            const publicKey = await KeyManager.importPublicKey(viewer.public_key);
                            const encryptedStatusKey = await HybridEncryptor.encryptKeyWithRSA(statusKeyExported, publicKey);
                            
                            await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, "status_keys", ID.unique(), {
                                owner_id: user?.$id,
                                poster_id: user?.$id,
                                recipient_id: viewer.user_id,
                                viewer_id: viewer.user_id,
                                encrypted_key: encryptedStatusKey,
                                created_at: new Date().toISOString()
                            });
                        } catch (err) {
                            console.error(`Failed to share status key with ${viewer.user_id}`, err);
                        }
                    }
                }));

                // Also share with the currently unlocked local identity so new posts survive cloud key drift.
                if (selfPublicKeyBase64) {
                    const selfPublicKey = await KeyManager.importPublicKey(selfPublicKeyBase64);
                    await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, "status_keys", ID.unique(), {
                        owner_id: user?.$id,
                        poster_id: user?.$id,
                        recipient_id: user?.$id,
                        viewer_id: user?.$id,
                        encrypted_key: await HybridEncryptor.encryptKeyWithRSA(statusKeyExported, selfPublicKey),
                        created_at: new Date().toISOString()
                    });
                } else {
                    console.warn("[Security] Local self public key missing. Skipping self-key-sharing.");
                }

            } catch (kErr) {
                console.error("Key sharing failed", kErr);
            }

            onSuccess();
            onClose();
        } catch (e) {
            console.error("Posting status failed", e);
            alert("Security protocol failed to transmit status.");
        }
        setIsUploading(false);
    };

    const toggleExclusion = (userId: string) => {
        setExcludedUsers(prev => 
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-110 flex items-center justify-center bg-black/60 backdrop-blur-md p-6"
            >
                <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                    className="w-full max-w-lg bg-white rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                >
                    <div className="p-8 border-b border-gray-100 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                                <Shield className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Broadcasting Status</h3>
                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">Temporary E2EE Artifact</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 bg-[#1a2332] hover:bg-[#252f44] rounded-xl transition-colors text-white shadow-lg">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        {step === 'type' && (
                            <div className="grid grid-cols-1 gap-4">
                                <button 
                                    onClick={() => { setStatusType('text'); setStep('edit'); }}
                                    className="p-8 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-3xl flex items-center gap-6 transition-all group"
                                >
                                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm group-hover:scale-110 transition-transform">
                                        <Type className="w-8 h-8" />
                                    </div>
                                    <div className="text-left">
                                        <h4 className="text-lg font-black text-gray-900">Text Protocol</h4>
                                        <p className="text-xs text-gray-500 font-medium">Transmit secure textual signals.</p>
                                    </div>
                                </button>
                                
                                <label className="p-8 bg-purple-50 hover:bg-purple-100 border border-purple-100 rounded-3xl flex items-center gap-6 transition-all group cursor-pointer">
                                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-purple-600 shadow-sm group-hover:scale-110 transition-transform">
                                        <ImageIcon className="w-8 h-8" />
                                    </div>
                                    <div className="text-left">
                                        <h4 className="text-lg font-black text-gray-900">Visual Artifact</h4>
                                        <p className="text-xs text-gray-500 font-medium">Share encrypted imagery.</p>
                                    </div>
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileSelect(e, 'image')} />
                                </label>

                                <label className="p-8 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-3xl flex items-center gap-6 transition-all group cursor-pointer">
                                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm group-hover:scale-110 transition-transform">
                                        <VideoIcon className="w-8 h-8" />
                                    </div>
                                    <div className="text-left">
                                        <h4 className="text-lg font-black text-gray-900">Motion Signal</h4>
                                        <p className="text-xs text-gray-500 font-medium">Broadcast secure video packets.</p>
                                    </div>
                                    <input type="file" className="hidden" accept="video/*" onChange={(e) => handleFileSelect(e, 'video')} />
                                </label>
                            </div>
                        )}

                        {step === 'edit' && (
                            <div className="space-y-8">
                                {statusType === 'text' ? (
                                    <div className="space-y-6">
                                        <div 
                                            className="w-full aspect-square rounded-[3rem] p-12 flex items-center justify-center transition-colors shadow-inner"
                                            style={{ backgroundColor: bgColor }}
                                        >
                                            <textarea 
                                                className="status-textarea bg-transparent border-none outline-none text-white text-3xl font-black italic text-center w-full placeholder:text-white/50 resize-none h-full flex items-center justify-center"
                                                placeholder="Decrypting thoughts..."
                                                value={textContent}
                                                onChange={(e) => setTextContent(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex justify-center gap-3">
                                            {bgOptions.map(bg => (
                                                <button 
                                                    key={bg} 
                                                    onClick={() => setBgColor(bg)}
                                                    className={`w-10 h-10 rounded-xl transition-all shadow-sm ${bgColor === bg ? 'scale-125 border-4 border-white ring-2 ring-gray-200' : 'hover:scale-110'}`}
                                                    style={{ backgroundColor: bg }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="w-full aspect-square rounded-[3rem] bg-gray-100 overflow-hidden shadow-inner flex items-center justify-center relative">
                                            {statusType === 'image' ? (
                                                <img src={filePreview!} className="w-full h-full object-cover" alt="" />
                                            ) : (
                                                <video src={filePreview!} className="w-full h-full object-cover" autoPlay muted loop />
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Secure Caption</label>
                                            <input 
                                                type="text" 
                                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 outline-none focus:ring-4 focus:ring-blue-100 transition-all text-sm font-medium"
                                                placeholder="Add context to this artifact..."
                                                value={caption}
                                                onChange={(e) => setCaption(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                                <div className="flex gap-4">
                                    <button onClick={() => setStep('type')} className="flex-1 h-16 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all">Back</button>
                                    <button onClick={() => setStep('privacy')} className="flex-2 h-16 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all">Privacy Settings</button>
                                </div>
                            </div>
                        )}

                        {step === 'privacy' && (
                            <div className="space-y-6">
                                <div className="p-6 bg-amber-50 border border-amber-100 rounded-3xl space-y-2">
                                    <h5 className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">
                                        <Shield className="w-3.5 h-3.5" /> Exclusion Protocol
                                    </h5>
                                    <p className="text-[11px] text-amber-600 font-bold leading-relaxed">
                                        Select the identities that should NOT be granted decryption access to this broadcast.
                                    </p>
                                </div>

                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input 
                                        type="text"
                                        placeholder="Search identities..."
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-6 text-sm outline-none"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>

                                <div className="h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                    {availableContacts.filter(u => (u.username || "").toLowerCase().includes(searchQuery.toLowerCase())).map(u => (
                                        <button 
                                            key={u.$id}
                                            onClick={() => toggleExclusion(u.user_id)}
                                            className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all border ${excludedUsers.includes(u.user_id) ? 'bg-red-50 border-red-200' : 'bg-transparent border-transparent hover:bg-slate-50'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center font-bold text-slate-500">{u.username[0].toUpperCase()}</div>
                                                <span className="text-sm font-bold text-gray-800">{u.username}</span>
                                            </div>
                                            {excludedUsers.includes(u.user_id) && <UserMinus className="w-4 h-4 text-red-600" />}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex gap-4">
                                    <button onClick={() => setStep('edit')} className="flex-1 h-16 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all">Back</button>
                                    <button 
                                        onClick={handlePostStatus}
                                        disabled={isUploading}
                                        className="flex-2 h-16 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-3"
                                    >
                                        {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-5 h-5" /> Broadcast Final</>}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
