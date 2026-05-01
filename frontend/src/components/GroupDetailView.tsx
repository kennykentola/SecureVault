import React, { useState, useEffect } from 'react';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { Query } from 'appwrite';
import { 
    X, Users, Image as ImageIcon, FileText, Link as LinkIcon, 
    Settings, Shield, UserPlus, UserMinus, LogOut, Flag,
    Edit3, Save, Loader2, Camera, Trash2, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { KeyManager } from '../crypto/keyManager';
import { HybridEncryptor } from '../crypto/encryptor';

interface GroupDetailViewProps {
    isOpen: boolean;
    onClose: () => void;
    group: any;
    onUpdate: () => void;
}

export const GroupDetailView: React.FC<GroupDetailViewProps> = ({ isOpen, onClose, group, onUpdate }) => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'info' | 'members' | 'media' | 'settings'>('info');
    const [members, setMembers] = useState<any[]>([]);
    const [media, setMedia] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    
    const [editName, setEditName] = useState(group.name);
    const [editDesc, setEditDesc] = useState(group.description);
    const [isAdminOnly, setIsAdminOnly] = useState(group.is_admin_only || false);
    const [membersCanAdd, setMembersCanAdd] = useState(group.members_can_add !== false);
    const [myRole, setMyRole] = useState<'admin' | 'member'>('member');
    const [privacyControlsUnavailable, setPrivacyControlsUnavailable] = useState(false);
    const [isRotatingKeys, setIsRotatingKeys] = useState(false);

    const isUnknownAttributeError = (error: any) =>
        typeof error?.message === 'string' && error.message.includes("Unknown attribute");

    useEffect(() => {
        if (isOpen && group) {
            fetchMembers();
            fetchMedia();
            setEditName(group.name);
            setEditDesc(group.description);
            setIsAdminOnly(group.is_admin_only || false);
            setMembersCanAdd(group.members_can_add !== false);
            setPrivacyControlsUnavailable(false);
        }
    }, [isOpen, group]);

    const fetchMembers = async () => {
        try {
            const res = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, "group_members", [
                Query.equal("group_id", group.$id)
            ]);
            const memberDetails = await Promise.all(res.documents.map(async (m) => {
                try {
                    const u = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_USERS, [
                        Query.equal("user_id", m.user_id)
                    ]);
                    if (m.user_id === user?.$id) setMyRole(m.role as any);
                    return { ...m, profile: u.documents[0] };
                } catch { return m; }
            }));
            setMembers(memberDetails);
        } catch (e) { console.error(e); }
    };

    const fetchMedia = async () => {
        try {
            const res = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, "group_media", [
                Query.equal("group_id", group.$id),
                Query.orderDesc("timestamp"),
                Query.limit(50)
            ]);
            setMedia(res.documents);
        } catch (e) { console.error(e); }
    };

    const handleSaveSettings = async () => {
        if (myRole !== 'admin') return;
        setIsLoading(true);
        try {
            try {
                await databases.updateDocument(APPWRITE_CONFIG.DATABASE_ID, "groups", group.$id, {
                    name: editName,
                    description: editDesc,
                    is_admin_only: isAdminOnly,
                    members_can_add: membersCanAdd
                });
            } catch (e: any) {
                if (!isUnknownAttributeError(e)) throw e;

                setPrivacyControlsUnavailable(true);
                await databases.updateDocument(APPWRITE_CONFIG.DATABASE_ID, "groups", group.$id, {
                    name: editName,
                    description: editDesc
                });
                alert("Group privacy controls are not enabled on this server yet. Name and description were saved, but admin-only posting settings were skipped.");
            }
            setIsEditing(false);
            onUpdate();
        } catch (e) { console.error(e); }
        setIsLoading(false);
    };

    const handleTogglePrivacy = async (key: 'is_admin_only' | 'members_can_add', value: boolean) => {
        if (myRole !== 'admin') return;
        try {
            if (key === 'is_admin_only') setIsAdminOnly(value);
            else setMembersCanAdd(value);

            await databases.updateDocument(APPWRITE_CONFIG.DATABASE_ID, "groups", group.$id, {
                [key]: value
            });
            onUpdate();
        } catch (e: any) {
            console.error(e);
            if (key === 'is_admin_only') setIsAdminOnly(group.is_admin_only || false);
            else setMembersCanAdd(group.members_can_add !== false);

            if (isUnknownAttributeError(e)) {
                setPrivacyControlsUnavailable(true);
                alert("Group privacy controls are not enabled on this server yet. Run the backend schema setup to enable admin-only posting settings.");
            }
        }
    };

    const handleLeaveGroup = async () => {
        if (!window.confirm("Are you sure you want to leave this group?")) return;
        try {
            const membership = members.find(m => m.user_id === user?.$id);
            if (membership) {
                await databases.deleteDocument(APPWRITE_CONFIG.DATABASE_ID, "group_members", membership.$id);
                onClose();
                onUpdate();
            }
        } catch (e) { console.error(e); }
    };

    const handleRemoveMember = async (membershipId: string) => {
        if (myRole !== 'admin') return;
        try {
            await databases.deleteDocument(APPWRITE_CONFIG.DATABASE_ID, "group_members", membershipId);
            fetchMembers();
        } catch (e) { console.error(e); }
    };

    const handleToggleAdmin = async (m: any) => {
        if (myRole !== 'admin') return;
        const newRole = m.role === 'admin' ? 'member' : 'admin';
        try {
            await databases.updateDocument(APPWRITE_CONFIG.DATABASE_ID, "group_members", m.$id, {
                role: newRole
            });
            fetchMembers();
        } catch (e) { console.error(e); }
    };

    const handleRotateGroupKey = async () => {
        if (myRole !== 'admin') return;
        if (!window.confirm("Generate a fresh group key for all current members? Older encrypted messages will still need the old key copy.")) return;

        setIsRotatingKeys(true);
        try {
            const localPubKey = await KeyManager.getPublicKey();
            const [membersRes, usersRes] = await Promise.all([
                databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, "group_members", [
                    Query.equal("group_id", group.$id)
                ]),
                databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_USERS, [
                    Query.limit(100)
                ])
            ]);

            const freshAesKey = crypto.getRandomValues(new Uint8Array(32));
            const freshKeyString = btoa(String.fromCharCode(...freshAesKey));
            const memberByUserId = new Map(usersRes.documents.map((profile) => [profile.user_id, profile]));

            const updates = membersRes.documents.map(async (membership) => {
                const profile = memberByUserId.get(membership.user_id);
                const publicKeyStr = membership.user_id === user?.$id
                    ? (localPubKey || profile?.public_key || profile?.publicKey)
                    : (profile?.public_key || profile?.publicKey);
                if (!publicKeyStr) return null;

                const pubKey = await KeyManager.importPublicKey(publicKeyStr);
                const encrypted_group_key = await HybridEncryptor.encryptKeyWithRSA(freshKeyString, pubKey);
                return databases.updateDocument(APPWRITE_CONFIG.DATABASE_ID, "group_members", membership.$id, {
                    encrypted_group_key
                });
            });

            await Promise.allSettled(updates);
            await fetchMembers();
            onUpdate();
            alert("A fresh group key has been distributed to members with valid public keys.");
        } catch (e) {
            console.error("Failed to rotate group key", e);
            alert("Unable to rotate the group key right now.");
        }
        setIsRotatingKeys(false);
    };

    const getAvatarUrl = (id: string | null | undefined) => {
        if (!id) return null;
        return `${APPWRITE_CONFIG.ENDPOINT}/storage/buckets/${APPWRITE_CONFIG.BUCKET_ID}/files/${id}/view?project=${APPWRITE_CONFIG.PROJECT_ID}`;
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-100 flex items-center justify-end bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div 
                    initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="w-full max-w-lg h-full bg-white shadow-2xl flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-slate-50">
                        <div className="flex items-center gap-4">
                            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                            <h2 className="text-xl font-bold text-gray-800">Group Info</h2>
                        </div>
                        {myRole === 'admin' && activeTab === 'info' && (
                            <button 
                                onClick={() => isEditing ? handleSaveSettings() : setIsEditing(true)}
                                className={`p-2 rounded-xl transition-all ${isEditing ? 'bg-green-500 text-white' : 'hover:bg-gray-200 text-gray-600'}`}
                            >
                                {isEditing ? (isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />) : <Edit3 className="w-5 h-5" />}
                            </button>
                        )}
                    </div>

                    {/* Group Hero Section */}
                    <div className="p-8 flex flex-col items-center border-b border-gray-100">
                        <div className="relative group">
                            <div className="w-32 h-32 rounded-[2.5rem] bg-indigo-100 flex items-center justify-center text-5xl font-black text-indigo-500 overflow-hidden shadow-xl border-4 border-white">
                                {group.avatar_url || group.avatar_id ? (
                                    <img src={getAvatarUrl(group.avatar_url || group.avatar_id)!} alt="" className="w-full h-full object-cover" />
                                ) : group.name[0].toUpperCase()}
                            </div>
                            {myRole === 'admin' && isEditing && (
                                <label className="absolute bottom-0 right-0 p-3 bg-indigo-600 text-white rounded-2xl shadow-lg cursor-pointer hover:bg-indigo-700 transition-all">
                                    <Camera className="w-4 h-4" />
                                    <input type="file" className="hidden" />
                                </label>
                            )}
                        </div>
                        <div className="mt-6 text-center">
                            {isEditing ? (
                                <input 
                                    className="text-2xl font-black text-center bg-transparent border-b-2 border-indigo-500 outline-none w-full"
                                    value={editName} onChange={(e) => setEditName(e.target.value)}
                                />
                            ) : <h3 className="text-2xl font-black text-gray-900 tracking-tight italic">{group.name}</h3>}
                            <div className="flex items-center justify-center gap-2 mt-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                                    {members.length} Members
                                </span>
                                <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${myRole === 'admin' ? 'text-amber-600 bg-amber-50 border-amber-100' : 'text-slate-600 bg-slate-50 border-slate-100'}`}>
                                    {myRole === 'admin' ? 'Admin Access' : 'Member'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-gray-100 px-4">
                        {(['info', 'members', 'media', 'settings'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all relative ${activeTab === tab ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <span className="flex items-center justify-center gap-2">
                                    {tab === 'info' && <Shield className="w-3.5 h-3.5" />}
                                    {tab === 'members' && <Users className="w-3.5 h-3.5" />}
                                    {tab === 'media' && <ImageIcon className="w-3.5 h-3.5" />}
                                    {tab === 'settings' && <Settings className="w-3.5 h-3.5" />}
                                    {tab}
                                </span>
                                {activeTab === tab && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                        {activeTab === 'info' && (
                            <div className="space-y-8">
                                <section className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">About the Channel</h4>
                                    {isEditing ? (
                                        <textarea 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-300 transition-all text-sm h-32 resize-none"
                                            value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                                        />
                                    ) : (
                                        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                                            <p className="text-sm text-gray-600 leading-relaxed font-medium">
                                                {group.description || 'Secure communication channel with end-to-end encryption.'}
                                            </p>
                                        </div>
                                    )}
                                </section>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-green-50/50 border border-green-100 rounded-2xl flex flex-col gap-1">
                                        <span className="text-[9px] font-bold text-green-600 uppercase tracking-widest">Encryption</span>
                                        <span className="text-xs font-black text-gray-800">Quantum-RSA/AES</span>
                                    </div>
                                    <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl flex flex-col gap-1">
                                        <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest">Created</span>
                                        <span className="text-xs font-black text-gray-800">{new Date(group.$createdAt).toLocaleDateString()}</span>
                                    </div>
                                </div>

                                <div className="space-y-3 pt-4">
                                    <button onClick={handleLeaveGroup} className="w-full flex items-center justify-between p-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl transition-all border border-red-100 group">
                                        <span className="text-xs font-black uppercase tracking-widest">Leave Group</span>
                                        <LogOut className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    </button>
                                    <button className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-2xl transition-all border border-slate-100 group">
                                        <span className="text-xs font-black uppercase tracking-widest">Report Group</span>
                                        <Flag className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'members' && (
                            <div className="space-y-6">
                                {myRole === 'admin' && (
                                    <button className="w-full flex items-center gap-4 p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all font-black uppercase tracking-widest text-xs shadow-lg shadow-indigo-600/20">
                                        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                                            <UserPlus className="w-4 h-4" />
                                        </div>
                                        Add New Operative
                                    </button>
                                )}

                                <div className="space-y-2">
                                    {members.map(m => (
                                        <div key={m.$id} className="flex items-center justify-between p-4 hover:bg-slate-50 rounded-2xl transition-all group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-slate-200 overflow-hidden flex items-center justify-center font-bold text-slate-500">
                                                    {m.profile?.avatar_id ? <img src={getAvatarUrl(m.profile.avatar_id)!} className="w-full h-full object-cover" /> : (m.profile?.username || 'U')[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <h5 className="text-sm font-black text-gray-900 flex items-center gap-2">
                                                        {m.profile?.username} {m.user_id === user?.$id && <span className="text-[8px] bg-slate-100 px-1.5 py-0.5 rounded text-gray-400">YOU</span>}
                                                    </h5>
                                                    <span className={`text-[9px] font-black uppercase tracking-widest ${m.role === 'admin' ? 'text-amber-500' : 'text-gray-400'}`}>
                                                        {m.role}
                                                    </span>
                                                </div>
                                            </div>
                                            {myRole === 'admin' && m.user_id !== user?.$id && (
                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleToggleAdmin(m)} className="p-2 hover:bg-amber-100 text-amber-600 rounded-xl transition-all" title={m.role === 'admin' ? "Demote to Member" : "Promote to Admin"}>
                                                        <Shield className={`w-4 h-4 ${m.role === 'admin' ? 'fill-current' : ''}`} />
                                                    </button>
                                                    <button onClick={() => handleRemoveMember(m.$id)} className="p-2 hover:bg-red-100 text-red-600 rounded-xl transition-all">
                                                        <UserMinus className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'media' && (
                            <div className="space-y-8">
                                <div className="grid grid-cols-3 gap-3">
                                    {media.filter(m => m.file_type === 'image').map(m => (
                                        <div key={m.$id} className="aspect-square bg-slate-100 rounded-2xl overflow-hidden hover:opacity-80 transition-opacity cursor-pointer border border-slate-200">
                                            <img src={getAvatarUrl(m.file_id)!} alt="" className="w-full h-full object-cover" />
                                        </div>
                                    ))}
                                </div>
                                {media.filter(m => m.file_type !== 'image').length > 0 && (
                                    <div className="space-y-3">
                                        <h5 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-1">Documents & Links</h5>
                                        {media.filter(m => m.file_type !== 'image').map(m => (
                                            <a key={m.$id} href="#" className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100 transition-all group">
                                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-500 shadow-sm">
                                                    {m.file_type === 'link' ? <LinkIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-gray-800 truncate">{m.file_name}</p>
                                                    <p className="text-[9px] text-gray-400 uppercase font-bold tracking-widest">{m.file_type} • {m.file_size ? `${(m.file_size/1024).toFixed(1)} KB` : 'Direct Link'}</p>
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                )}
                                {media.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 opacity-30">
                                        <ImageIcon className="w-16 h-16" />
                                        <p className="text-[10px] font-black uppercase tracking-widest">No intelligence shared yet</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div className="space-y-6">
                                {myRole !== 'admin' ? (
                                    <div className="p-8 text-center bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                                        <Shield className="w-12 h-12 text-slate-300 mx-auto" />
                                        <p className="text-xs font-bold text-slate-500">Only channel administrators can access these protocols.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-8">
                                        <section className="space-y-4">
                                            <h5 className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Privacy & Governance</h5>
                                            {privacyControlsUnavailable && (
                                                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Server Schema Update Needed</p>
                                                    <p className="text-xs text-amber-700 mt-2 leading-relaxed">
                                                        This backend has not enabled the group privacy attributes yet. Run the backend schema setup, then redeploy to use admin-only posting and member-add permissions.
                                                    </p>
                                                </div>
                                            )}
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <div>
                                                        <p className="text-xs font-black text-gray-800">Admin-Only Messaging</p>
                                                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Restrict member transmissions</p>
                                                    </div>
                                                    <div 
                                                        onClick={() => !privacyControlsUnavailable && handleTogglePrivacy('is_admin_only', !isAdminOnly)}
                                                        className={`w-12 h-6 rounded-full relative transition-colors ${privacyControlsUnavailable ? 'bg-slate-200 cursor-not-allowed opacity-50' : isAdminOnly ? 'bg-indigo-600 cursor-pointer' : 'bg-slate-200 cursor-pointer'}`}
                                                    >
                                                        <motion.div 
                                                            animate={{ x: isAdminOnly ? 24 : 0 }}
                                                            className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" 
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <div>
                                                        <p className="text-xs font-black text-gray-800">Member Add Permissions</p>
                                                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Allow members to add contacts</p>
                                                    </div>
                                                    <div 
                                                        onClick={() => !privacyControlsUnavailable && handleTogglePrivacy('members_can_add', !membersCanAdd)}
                                                        className={`w-12 h-6 rounded-full relative transition-colors ${privacyControlsUnavailable ? 'bg-slate-200 cursor-not-allowed opacity-50' : membersCanAdd ? 'bg-indigo-600 cursor-pointer' : 'bg-slate-200 cursor-pointer'}`}
                                                    >
                                                        <motion.div 
                                                            animate={{ x: membersCanAdd ? 24 : 0 }}
                                                            className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" 
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </section>

                                        <section className="space-y-4">
                                            <h5 className="text-[10px] font-black uppercase tracking-widest text-red-400 ml-1">Terminal Actions</h5>
                                            <button
                                                onClick={handleRotateGroupKey}
                                                disabled={isRotatingKeys}
                                                className="w-full flex items-center gap-4 p-5 bg-indigo-50 text-indigo-700 rounded-2xl hover:bg-indigo-100 transition-all border border-indigo-100 group disabled:opacity-60"
                                            >
                                                <RefreshCw className={`w-5 h-5 ${isRotatingKeys ? 'animate-spin' : 'group-hover:rotate-45 transition-transform'}`} />
                                                <div className="flex-1 text-left">
                                                    <p className="text-xs font-black uppercase tracking-widest">Rotate Group Key</p>
                                                    <p className="text-[8px] font-bold uppercase tracking-widest mt-1">Re-share a fresh key to current members</p>
                                                </div>
                                            </button>
                                            <button 
                                                onClick={async () => {
                                                    if (window.confirm("CRITICAL: This will permanently dissolve the channel and delete all artifacts. Proceed?")) {
                                                        try {
                                                            await databases.deleteDocument(APPWRITE_CONFIG.DATABASE_ID, "groups", group.$id);
                                                            onClose();
                                                            onUpdate();
                                                        } catch (e) { console.error(e); }
                                                    }
                                                }}
                                                className="w-full flex items-center gap-4 p-5 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-all border border-red-100 group"
                                            >
                                                <Trash2 className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                                                <div className="flex-1 text-left">
                                                    <p className="text-xs font-black uppercase tracking-widest">Dissolve Channel</p>
                                                    <p className="text-[8px] font-bold uppercase tracking-widest mt-1">Permanent deletion of all artifacts</p>
                                                </div>
                                            </button>
                                        </section>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
