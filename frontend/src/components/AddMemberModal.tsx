import React, { useState, useEffect } from 'react';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { Query, ID } from 'appwrite';
import { X, Search, Check, UserPlus, Loader2, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { KeyManager } from '../crypto/keyManager';
import { HybridEncryptor } from '../crypto/encryptor';

interface AddMemberModalProps {
    isOpen: boolean;
    onClose: () => void;
    group: any;
    onAdded: () => void;
    onRequestKeySync?: (groupId: string) => Promise<void> | void;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({ isOpen, onClose, group, onAdded, onRequestKeySync }) => {
    const { user, privateKey, legacyPrivateKeys } = useAuth();
    const [searchQuery, setSearchQuery] = useState("");
    const [availableUsers, setAvailableUsers] = useState<any[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [myRole, setMyRole] = useState<'admin' | 'member'>('member');
    const availablePrivateKeys = [privateKey, ...legacyPrivateKeys].filter((key): key is CryptoKey => !!key);

    useEffect(() => {
        if (isOpen) {
            fetchUsers();
            setSelectedUsers([]);
        }
    }, [isOpen]);

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            // Get all users
            const res = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_USERS, [
                Query.limit(100)
            ]);
            
            // Get current members to exclude
            const membersRes = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, "group_members", [
                Query.equal("group_id", group.$id)
            ]);
            const memberIds = membersRes.documents.map(m => m.user_id);
            const myMembership = membersRes.documents.find(m => m.user_id === user?.$id);
            if (myMembership?.role) setMyRole(myMembership.role === 'admin' ? 'admin' : 'member');
            
            setAvailableUsers(res.documents.filter(u => u.user_id !== user?.$id && !memberIds.includes(u.user_id)));
        } catch (e) { console.error(e); }
        setIsLoading(false);
    };

    const toggleUser = (userId: string) => {
        setSelectedUsers(prev => 
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const handleAddMembers = async () => {
        if (selectedUsers.length === 0 || !availablePrivateKeys.length) return;
        setIsAdding(true);
        try {
            if (group.members_can_add === false && myRole !== 'admin') {
                throw new Error("Only group administrators can add new members in this channel.");
            }

            // 1. Decrypt the group AES key from my own membership record
            const myMembershipRes = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, "group_members", [
                Query.and([
                    Query.equal("group_id", group.$id),
                    Query.equal("user_id", user?.$id)
                ])
            ]);
            
            if (myMembershipRes.total === 0) throw new Error("I am not a member of this group");
            const myEncryptedKey = myMembershipRes.documents[0].encrypted_group_key;
            
            // Recover the RAW Base64 AES key
            let rawAesKeyB64: string | null = null;
            try {
                if (!myEncryptedKey) throw new Error("Membership record is missing the group security key.");
                let lastError: any = null;
                for (const candidateKey of availablePrivateKeys) {
                    try {
                        rawAesKeyB64 = await HybridEncryptor.decryptKeyWithRSA(myEncryptedKey, candidateKey);
                        break;
                    } catch (error) {
                        lastError = error;
                    }
                }
                if (!rawAesKeyB64 && lastError) {
                    throw lastError;
                }
                if (!rawAesKeyB64) {
                    throw new Error("Group membership key unavailable.");
                }
            } catch (decErr: any) {
                console.error("[AddMember] Group Key Decryption Failed:", {
                    error: decErr.message || decErr.name,
                    membershipId: myMembershipRes.documents[0].$id,
                    hasPrivateKey: availablePrivateKeys.length > 0
                });

                if (typeof onRequestKeySync === 'function') {
                    try {
                        await onRequestKeySync(group.$id);
                        await new Promise(resolve => setTimeout(resolve, 1800));
                        const refreshedMembership = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, "group_members", [
                            Query.and([
                                Query.equal("group_id", group.$id),
                                Query.equal("user_id", user?.$id)
                            ])
                        ]);
                        if (refreshedMembership.total > 0) {
                            const refreshedKey = refreshedMembership.documents[0].encrypted_group_key;
                            if (refreshedKey) {
                                let repairedKey: string | null = null;
                                for (const candidateKey of availablePrivateKeys) {
                                    try {
                                        repairedKey = await HybridEncryptor.decryptKeyWithRSA(refreshedKey, candidateKey);
                                        break;
                                    } catch {
                                        continue;
                                    }
                                }
                                if (repairedKey) {
                                    rawAesKeyB64 = repairedKey;
                                    console.log("[AddMember] Recovered a fresh copy of the group key after sync request.");
                                }
                            }
                        }
                    } catch (syncErr) {
                        console.error("[AddMember] Key sync retry failed:", syncErr);
                    }
                }

                if (!rawAesKeyB64) {
                    const isMismatch = decErr.name === "OperationError" || decErr.message.includes("mismatch") || decErr.message.includes("unlock");
                    const userMessage = isMismatch 
                        ? "Your current vault cannot decrypt this group's key yet. If another admin or member still has access, they can repair the key and you can try again."
                        : `Unable to unlock the group key. (${decErr.message})`;
                    throw new Error(userMessage);
                }
                
                console.log("[AddMember] Continuing after successful key repair.");
            }
            
            // 2. Encrypt and add each new member
            for (const memberId of selectedUsers) {
                const memberData = availableUsers.find(u => u.user_id === memberId);
                if (memberData?.public_key) {
                    const pubKey = await KeyManager.importPublicKey(memberData.public_key);
                    const encryptedForMember = await HybridEncryptor.encryptKeyWithRSA(rawAesKeyB64, pubKey);
                    
                    await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, "group_members", ID.unique(), {
                        group_id: group.$id,
                        user_id: memberId,
                        encrypted_group_key: encryptedForMember,
                        role: "member"
                    });
                }
            }
            
            onAdded();
            onClose();
        } catch (e: any) { 
            console.error("[AddMember] Error adding member to group:", e);
            alert(e.message || "Failed to share secure protocol with new members. Check console for details.");
        }
        setIsAdding(false);
    };

    const filteredUsers = availableUsers.filter(u => 
        (u.username || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
        (u.email || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-110 flex items-center justify-center bg-[#0a0f0d]/90 backdrop-blur-md p-6"
            >
                <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                    className="w-full max-w-md bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border border-[#FFF5CC]"
                >
                    <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                                <UserPlus className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Add Members</h3>
                                <p className="text-[10px] text-primary-600 font-black uppercase tracking-widest mt-1">Expanding Group Collective</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 bg-[#1a2332] hover:bg-[#252f44] rounded-xl transition-colors text-white shadow-lg">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="p-8 space-y-6">
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input 
                                type="text" 
                                placeholder="Search identity records..." 
                                className="w-full bg-[#FFF9E3]/30 border border-[#FFF5CC] rounded-2xl py-3.5 pl-11 pr-4 outline-none focus:ring-4 focus:ring-primary-100 focus:border-primary-300 transition-all text-sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
                            ) : filteredUsers.length > 0 ? (
                                filteredUsers.map(u => (
                                    <button 
                                        key={u.$id}
                                        onClick={() => toggleUser(u.user_id)}
                                        className={`w-full p-4 rounded-2xl flex items-center gap-3 transition-all border ${selectedUsers.includes(u.user_id) ? 'bg-indigo-50 border-indigo-200' : 'bg-transparent border-transparent hover:bg-slate-50'}`}
                                    >
                                        <div className="w-10 h-10 bg-[#FFF5CC] rounded-xl flex items-center justify-center font-bold text-primary-600">
                                            {(u.username || u.email || "?")[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 text-left min-w-0">
                                            <div className="text-sm font-black text-gray-800 truncate">{u.username || "Legacy Node"}</div>
                                            <div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest truncate">{u.email}</div>
                                        </div>
                                        {selectedUsers.includes(u.user_id) && (
                                            <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg"><Check className="w-3.5 h-3.5 text-white" /></div>
                                        )}
                                    </button>
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full opacity-30 italic text-sm">No available users found</div>
                            )}
                        </div>

                        <button 
                             disabled={selectedUsers.length === 0 || isAdding}
                            onClick={handleAddMembers}
                            className="w-full h-14 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl flex items-center justify-center gap-3 text-sm font-black uppercase tracking-widest shadow-xl shadow-primary-600/20 active:scale-95 transition-all disabled:opacity-50"
                        >
                            {isAdding ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ShieldCheck className="w-5 h-5" /> Secure Addition</>}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
