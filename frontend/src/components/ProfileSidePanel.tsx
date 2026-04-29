import React from 'react';
import { Query } from 'appwrite';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image, Files, BellOff, Flag, ShieldCheck, Phone, Video, Search, Loader2, FileText, ExternalLink, Download, Film, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { KeyManager } from '../crypto/keyManager';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { HybridEncryptor } from '../crypto/encryptor';

interface ProfileSidePanelProps {
    isOpen: boolean;
    onClose: () => void;
    item: any; // User or Group
    messages: any[];
    getAvatarUrl: (id: string | null | undefined, bucketId?: string) => string | undefined;
    sharedGroups?: any[];
    sharedGroupsLoading?: boolean;
    onStartCall?: (type: 'voice' | 'video') => void;
    isMuted?: boolean;
    onToggleMute?: () => void;
    onReport?: () => void;
}

export const ProfileSidePanel: React.FC<ProfileSidePanelProps> = ({
    isOpen,
    onClose,
    item,
    messages,
    getAvatarUrl,
    sharedGroups = [],
    sharedGroupsLoading = false,
    onStartCall,
    isMuted = false,
    onToggleMute,
    onReport
}) => {
    const { user } = useAuth();
    const [isGeneratingCode, setIsGeneratingCode] = React.useState(false);
    const [securityCode, setSecurityCode] = React.useState<string | null>(null);
    const [securityMessage, setSecurityMessage] = React.useState<string | null>(null);
    const [groupMemberCount, setGroupMemberCount] = React.useState<number | null>(null);
    const isGroup = item?.type === 'group' || !!item?.group_id;
    const name = item?.username || item?.name || "Unknown";
    const bio = item?.bio || item?.description || (isGroup ? "Group description" : "Hey there! I'm using SecureVault.");
    const avatarUrl = item ? getAvatarUrl(item.avatar_id) : undefined;

    const [activeTab, setActiveTab] = React.useState<'media' | 'docs' | 'links'>('media');


    // Filter shared media
    const mediaItems = messages.filter(m => {
        if (m.gif_url) return true;
        if (m.type !== 'file') return false;
        const mime = m.originalMimeType || m.original_mime_type || m.mediaData?.originalMimeType || "";
        return mime.startsWith('image/') || mime.startsWith('video/');
    });

    const docItems = messages.filter(m => {
        if (m.type !== 'file') return false;
        const mime = m.originalMimeType || m.original_mime_type || m.mediaData?.originalMimeType || "";
        return !mime.startsWith('image/') && !mime.startsWith('video/');
    });

    const linkItems = messages.filter(m => {
        if (m.type !== 'text') return false;
        const text = (m.text || "").toString();
        return text.includes('http://') || text.includes('https://');
    }).map(m => {
        const text = (m.text || "").toString();
        const match = text.match(/https?:\/\/[^\s]+/);
        return { ...m, url: match ? match[0] : null };
    }).filter(m => !!m.url);

    const handleDownload = async (msg: any) => {
        if (!msg.fileId || !msg.iv) return;
        
        try {
            // This is a simplified version of the MessageBubble download logic
            // In a real app, you'd share this logic in a hook
            const bucketId = APPWRITE_CONFIG.BUCKET_ID;
            const fileId = msg.fileId;
            const iv = msg.iv;
            const originalMimeType = msg.originalMimeType || msg.original_mime_type || msg.mediaData?.originalMimeType;
            const fileName = msg.fileName || msg.filename || "download";

            // Get decryption key
            const rawKeyBase64 = msg.decryptedKeyBase64 || msg.mediaData?.decryptedKeyBase64;
            if (!rawKeyBase64) {
                alert("Decryption key not available for this session.");
                return;
            }

            const response = await fetch(`${APPWRITE_CONFIG.ENDPOINT}/storage/buckets/${bucketId}/files/${fileId}/download?project=${APPWRITE_CONFIG.PROJECT_ID}`);
            if (!response.ok) throw new Error("Download failed");
            const fileBlob = await response.blob();

            const rawKey = new Uint8Array(atob(rawKeyBase64).split('').map(c => c.charCodeAt(0)));
            const aesKey = await window.crypto.subtle.importKey(
                "raw", rawKey, { name: "AES-GCM" }, true, ["decrypt"]
            );

            const decryptedBlob = await HybridEncryptor.decryptFile(fileBlob, aesKey, iv, originalMimeType);
            const url = URL.createObjectURL(decryptedBlob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            link.click();
            
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            console.error("Download failed", e);
            alert("Security protocol failed to download artifact.");
        }
    };

    const statusLabel = isGroup
        ? `${groupMemberCount ?? item?.memberCount ?? 0} Members`
        : item?.status === 'online'
            ? 'Online'
            : 'Offline';

    const updatedLabel = item?.$updatedAt
        ? `Updated ${new Date(item.$updatedAt).toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        })}`
        : isGroup
            ? 'Group details sync securely'
            : 'Profile details sync securely';

    React.useEffect(() => {
        setIsGeneratingCode(false);
        setSecurityCode(null);
        setSecurityMessage(null);
        setGroupMemberCount(null);
    }, [isOpen, item?.$id, item?.user_id]);

    React.useEffect(() => {
        let ignore = false;

        const fetchGroupMemberCount = async () => {
            if (!isOpen || !isGroup || !item?.$id) {
                setGroupMemberCount(null);
                return;
            }

            try {
                const res = await databases.listDocuments(
                    APPWRITE_CONFIG.DATABASE_ID,
                    "group_members",
                    [Query.equal("group_id", item.$id), Query.limit(1)]
                );
                if (!ignore) {
                    setGroupMemberCount(res.total);
                }
            } catch (error) {
                if (!ignore) {
                    setGroupMemberCount(item?.memberCount ?? null);
                }
            }
        };

        fetchGroupMemberCount();

        return () => {
            ignore = true;
        };
    }, [isOpen, isGroup, item?.$id, item?.memberCount]);

    const buildSecurityCode = async (localKey: string, remoteKey: string) => {
        const encoder = new TextEncoder();
        const [firstKey, secondKey] = [localKey.trim(), remoteKey.trim()].sort();
        const digest = await window.crypto.subtle.digest("SHA-256", encoder.encode(`${firstKey}:${secondKey}`));
        const hex = Array.from(new Uint8Array(digest))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
        return hex.match(/.{1,4}/g)?.slice(0, 8).join(' ') || hex;
    };

    const handleVerifySecurityCode = async () => {
        if (isGroup) {
            setSecurityCode(null);
            setSecurityMessage("Security code verification is available for one-to-one chats only.");
            return;
        }

        if (!user) {
            setSecurityCode(null);
            setSecurityMessage("You need an active session before verifying a security code.");
            return;
        }

        setIsGeneratingCode(true);
        try {
            const localPublicKey = await KeyManager.getPublicKey();
            if (!localPublicKey) {
                throw new Error("Unlock or restore your vault on this device before verifying a security code.");
            }

            let remotePublicKey = item.public_key || item.publicKey || null;
            if (!remotePublicKey && item.user_id) {
                const res = await databases.listDocuments(
                    APPWRITE_CONFIG.DATABASE_ID,
                    APPWRITE_CONFIG.COLLECTION_USERS,
                    [Query.equal("user_id", item.user_id), Query.limit(1)]
                );
                if (res.total > 0) {
                    remotePublicKey = res.documents[0].public_key || res.documents[0].publicKey || null;
                }
            }

            if (!remotePublicKey) {
                throw new Error("This contact has not published a current public key yet, so there is no security code to compare.");
            }

            const code = await buildSecurityCode(localPublicKey, remotePublicKey);
            setSecurityCode(code);
            setSecurityMessage(`Compare this code with ${name}. If it matches on both devices, your one-to-one chat keys line up.`);
        } catch (error: any) {
            setSecurityCode(null);
            setSecurityMessage(error?.message || "Failed to generate the security code for this chat.");
        } finally {
            setIsGeneratingCode(false);
        }
    };

    if (!item) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Dark overlay for mobile */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40 md:hidden"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed right-0 top-0 bottom-0 w-full max-w-sm md:max-w-md bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col overflow-hidden h-full"
                    >
                        {/* Header */}
                        <header className="h-16 px-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                            <div className="flex items-center gap-4">
                                <button onClick={onClose} className="p-2 bg-[#1a2332] hover:bg-[#252f44] rounded-xl transition-colors text-white shadow-lg">
                                    <X className="w-5 h-5" />
                                </button>
                                <h2 className="text-lg font-bold text-slate-800">{isGroup ? 'Group Info' : 'Contact Info'}</h2>
                            </div>
                        </header>

                        {/* Content Scroll Area */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50">
                            {/* Hero Section */}
                            <div className="bg-white p-8 flex flex-col items-center border-b border-slate-100 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-24 bg-linear-to-br from-blue-500/10 to-indigo-500/10 opacity-50" />

                                <div className="relative group mb-6">
                                    <div className="w-40 h-40 rounded-[3rem] bg-slate-100 border-4 border-white shadow-2xl overflow-hidden flex items-center justify-center text-5xl font-black text-blue-500 transition-transform group-hover:scale-[1.02]">
                                        {avatarUrl ? (
                                            <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                                        ) : (
                                            <span>{name[0]?.toUpperCase()}</span>
                                        )}
                                    </div>
                                </div>

                                <div className="text-center space-y-2">
                                    <h3 className="text-2xl font-black italic tracking-tighter text-slate-900">{name}</h3>
                                    <p className="text-sm font-medium text-slate-500 tracking-tight">
                                        {statusLabel}
                                    </p>
                                </div>

                                {/* Quick Actions */}
                                <div className="flex items-center gap-6 mt-8">
                                    {[
                                        { icon: <Phone />, label: 'Audio', onClick: () => onStartCall?.('voice'), disabled: isGroup || !onStartCall },
                                        { icon: <Video />, label: 'Video', onClick: () => onStartCall?.('video'), disabled: isGroup || !onStartCall },
                                        { icon: <Search />, label: 'Search', disabled: true },
                                    ].map((action, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={action.onClick}
                                            disabled={!!action.disabled}
                                            className="flex flex-col items-center gap-2 group disabled:cursor-not-allowed"
                                        >
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm transition-all ${action.disabled
                                                    ? 'bg-slate-100 text-slate-300'
                                                    : 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white'
                                                }`}>
                                                {React.cloneElement(action.icon as React.ReactElement<{ className?: string }>, { className: 'w-5 h-5' })}
                                            </div>
                                            <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${action.disabled ? 'text-slate-300' : 'text-slate-400 group-hover:text-blue-600'
                                                }`}>{action.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Info Sections */}
                            <div className="p-4 space-y-4 pb-12">
                                {!isGroup && (
                                    <section className="bg-white p-6 rounded-4xl border border-slate-100 shadow-sm space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                                                <Phone className="w-4 h-4" />
                                            </div>
                                            <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-700">Phone Number</h4>
                                        </div>
                                        <p className="text-sm text-slate-700 leading-relaxed font-medium">
                                            {item.phone || "Not provided"}
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-medium leading-normal italic text-center">
                                            Used for discovery and secure E2EE key lookup.
                                        </p>
                                    </section>
                                )}

                                <section className="bg-white p-6 rounded-4xl border border-slate-100 shadow-sm space-y-4">
                                    <div className="space-y-1">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">About / Status</h4>
                                        <p className="text-sm text-slate-700 leading-relaxed font-medium">{bio}</p>
                                    </div>
                                    <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest pt-2">{updatedLabel}</p>
                                </section>

                                <section className="bg-white p-6 rounded-4xl border border-slate-100 shadow-sm space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500">
                                                <Image className="w-4 h-4" />
                                            </div>
                                            <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-700">Intelligence Catalog</h4>
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div className="flex p-1 bg-slate-100 rounded-2xl">
                                        {(['media', 'docs', 'links'] as const).map((tab) => (
                                            <button
                                                key={tab}
                                                onClick={() => setActiveTab(tab)}
                                                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
                                                    activeTab === tab 
                                                        ? 'bg-white text-blue-600 shadow-sm' 
                                                        : 'text-slate-400 hover:text-slate-600'
                                                }`}
                                            >
                                                {tab}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="min-h-[200px]">
                                        {activeTab === 'media' && (
                                            mediaItems.length > 0 ? (
                                                <div className="grid grid-cols-3 gap-2">
                                                    {mediaItems.slice(0, 12).map((m, i) => (
                                                        <div 
                                                            key={i} 
                                                            onClick={() => handleDownload(m)}
                                                            className="aspect-square bg-slate-100 rounded-xl overflow-hidden border border-slate-200 group relative cursor-pointer"
                                                        >
                                                            {m.gif_url ? (
                                                                <img src={m.gif_url} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-slate-400 bg-slate-200/50">
                                                                    {(m.originalMimeType || m.original_mime_type || m.mediaData?.originalMimeType || "").startsWith('video/') 
                                                                        ? <Film className="w-6 h-6" /> 
                                                                        : <Image className="w-6 h-6" />
                                                                    }
                                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                        <Download className="w-5 h-5 text-white" />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <EmptyState icon={<Image />} text="No visual artifacts" />
                                            )
                                        )}

                                        {activeTab === 'docs' && (
                                            docItems.length > 0 ? (
                                                <div className="space-y-2">
                                                    {docItems.slice(0, 10).map((m, i) => (
                                                        <button 
                                                            key={i} 
                                                            onClick={() => handleDownload(m)}
                                                            className="w-full flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100 transition-all text-left group"
                                                        >
                                                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-500 shadow-sm">
                                                                <FileText className="w-5 h-5" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-bold text-slate-800 truncate">{m.fileName || m.filename || "Document"}</p>
                                                                <p className="text-[9px] text-slate-400 font-black uppercase">{m.originalMimeType?.split('/')[1] || 'FILE'}</p>
                                                            </div>
                                                            <Download className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <EmptyState icon={<Files />} text="No documents shared" />
                                            )
                                        )}

                                        {activeTab === 'links' && (
                                            linkItems.length > 0 ? (
                                                <div className="space-y-2">
                                                    {linkItems.slice(0, 10).map((m, i) => (
                                                        <a 
                                                            key={i} 
                                                            href={m.url} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="w-full flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100 transition-all text-left group"
                                                        >
                                                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-500 shadow-sm">
                                                                <ExternalLink className="w-5 h-5" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-bold text-blue-600 truncate underline">{m.url}</p>
                                                                <p className="text-[9px] text-slate-400 font-black uppercase">Shared link</p>
                                                            </div>
                                                        </a>
                                                    ))}
                                                </div>
                                            ) : (
                                                <EmptyState icon={<ExternalLink />} text="No secure links found" />
                                            )
                                        )}
                                    </div>
                                </section>

                                {/* Security Section */}
                                <section className="bg-white p-6 rounded-4xl border border-slate-100 shadow-sm space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
                                            <ShieldCheck className="w-4 h-4" />
                                        </div>
                                        <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-700">Encryption</h4>
                                    </div>
                                    <p className="text-[11px] text-slate-500 leading-normal font-medium">
                                        Messages and calls are end-to-end encrypted. No one outside of this chat, not even SecureVault, can read or listen to them.
                                    </p>
                                    <button
                                        onClick={handleVerifySecurityCode}
                                        disabled={isGeneratingCode || isGroup}
                                        className="text-[10px] font-black text-blue-500 uppercase tracking-widest hover:underline disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {isGeneratingCode && <Loader2 className="w-3 h-3 animate-spin" />}
                                        {isGroup ? 'Available In Direct Chats' : (isGeneratingCode ? 'Generating Code...' : 'Verify Security Code')}
                                    </button>
                                    {securityCode && (
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Security Code</p>
                                            <p className="text-sm font-mono font-bold tracking-[0.2em] text-slate-800 wrap-break-word">{securityCode}</p>
                                        </div>
                                    )}
                                    {isGroup && !securityMessage && (
                                        <p className="text-[10px] font-medium leading-relaxed text-slate-400">
                                            Security code comparison is currently supported for one-to-one chats only.
                                        </p>
                                    )}
                                    {securityMessage && (
                                        <p className={`text-[10px] font-medium leading-relaxed ${securityCode ? 'text-slate-400' : 'text-amber-600'}`}>
                                            {securityMessage}
                                        </p>
                                    )}
                                </section>

                                {/* Groups In Common */}
                                {!isGroup && (
                                    <section className="bg-white p-6 rounded-4xl border border-slate-100 shadow-sm space-y-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                                                <Users className="w-4 h-4" />
                                            </div>
                                            <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-700">Groups in Common</h4>
                                        </div>
                                        <div className="space-y-4">
                                            {sharedGroupsLoading ? (
                                                <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    <span className="text-[11px] font-medium">Loading shared groups...</span>
                                                </div>
                                            ) : sharedGroups.length > 0 ? sharedGroups.map((g) => (
                                                <div key={g.$id || g.group_id || g.name} className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center text-xs font-bold">
                                                        {g.avatar ? (
                                                            <img src={g.avatar} className="w-full h-full object-cover" />
                                                        ) : g.avatar_id ? (
                                                            <img src={getAvatarUrl(g.avatar_id)} className="w-full h-full object-cover" />
                                                        ) : (
                                                            g.name[0]
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-800">{g.name}</p>
                                                        <p className="text-[10px] text-slate-400 font-medium">{g.memberCount || g.members || 0} Members</p>
                                                    </div>
                                                </div>
                                            )) : (
                                                <p className="text-[11px] text-slate-400 font-medium italic">No shared groups</p>
                                            )}
                                        </div>
                                    </section>
                                )}

                                {/* Danger Actions */}
                                <div className="space-y-2 pt-4">
                                    <button
                                        type="button"
                                        onClick={onToggleMute}
                                        className="w-full h-14 bg-white border border-slate-200 rounded-2xl flex items-center gap-4 px-6 text-slate-700 font-bold hover:bg-slate-50 transition-colors"
                                    >
                                        <BellOff className="w-5 h-5" />
                                        <span className="text-sm">{isMuted ? 'Unmute Notifications' : 'Mute Notifications'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onReport}
                                        className="w-full h-14 bg-white border border-slate-200 rounded-2xl flex items-center gap-4 px-6 text-red-500 font-bold hover:bg-red-50 transition-colors"
                                    >
                                        <Flag className="w-5 h-5" />
                                        <span className="text-sm">Report {isGroup ? 'Group' : 'Contact'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

const EmptyState = ({ icon, text }: { icon: React.ReactNode, text: string }) => (
    <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-4">
            {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-6 h-6' })}
        </div>
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{text}</p>
    </div>
);
