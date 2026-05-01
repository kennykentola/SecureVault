import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { Query, ID } from 'appwrite';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, ChevronRight, Check, Search, ShieldCheck } from 'lucide-react';

import { KeyManager } from '../crypto/keyManager';
import { HybridEncryptor } from '../crypto/encryptor';

interface CreateGroupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export const CreateGroupWizard: React.FC<CreateGroupWizardProps> = ({ isOpen, onClose, onCreated }) => {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [membersCanAdd, setMembersCanAdd] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      setStep(1);
      setSelectedUsers([]);
      setGroupName("");
      setGroupDesc("");
      setMembersCanAdd(true);
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    try {
      const res = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_USERS, [
        Query.limit(50)
      ]);
      setUsers(res.documents.filter(u => u.user_id !== user?.$id));
    } catch (e) { console.error(e); }
  };

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const filteredUsers = users.filter(u => 
    (u.username || "Legacy Node").toLowerCase().includes(searchQuery.toLowerCase()) || 
    (u.email || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isUnknownAttributeError = (error: any) =>
    typeof error?.message === 'string' && error.message.includes("Unknown attribute");

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setIsCreating(true);

    try {
        const localPubKeyStr = await KeyManager.getPublicKey();
        if (!localPubKeyStr) {
            throw new Error("Local security keys not found. Please unlock your vault or re-register your keys.");
        }
        const groupId = ID.unique();
        
        // 1. Create Group Entry
        const groupPayload = {
            group_id: groupId,
            name: groupName,
            description: groupDesc,
            created_by: user?.$id,
            is_admin_only: false,
            members_can_add: membersCanAdd
        };

        try {
            await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, "groups", groupId, groupPayload);
        } catch (groupErr: any) {
            if (!isUnknownAttributeError(groupErr)) throw groupErr;
            console.warn("Group privacy attributes are not available yet. Retrying with base group fields only.");
            await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, "groups", groupId, {
                group_id: groupId,
                name: groupName,
                description: groupDesc,
                created_by: user?.$id
            });
            alert("This server does not support group permission attributes yet. The group was created, but add-member permissions will use the server default until the schema is updated.");
        }

        // 2. Generate Group Secret Key (32 bytes AES)
        const aesKey = crypto.getRandomValues(new Uint8Array(32));
        const aesKeyString = btoa(String.fromCharCode(...aesKey));

        // 3. Encrypt Key for each member (including self)
        const membersToEncrypt = [...selectedUsers, user?.$id];
        
        for (const memberId of membersToEncrypt) {
            let memberData;
            try {
                if (memberId === user?.$id) {
                    console.log(`[Diagnostic] Using LOCAL public key for creator ${memberId}`);
                    memberData = { public_key: localPubKeyStr };
                } else {
                    memberData = users.find(u => u.user_id === memberId);
                }

                if (memberData?.public_key) {
                    const pubKey = await KeyManager.importPublicKey(memberData.public_key);
                    // Encrypt the AES key string using their RSA Public Key
                    const encryptedKey = await HybridEncryptor.encryptKeyWithRSA(aesKeyString, pubKey);
                    
                    await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, "group_members", ID.unique(), {
                        group_id: groupId,
                        user_id: memberId,
                        encrypted_group_key: encryptedKey,
                        role: memberId === user?.$id ? "admin" : "member"
                    });
                    console.log(`Secured group membership for ${memberId} using ${memberId === user?.$id ? 'LOCAL' : 'REMOTE'} key`);
                } else {
                    console.warn(`Skipping group membership for ${memberId} - No public key found`);
                }
            } catch (err) {
                console.error(`Failed to secure member ${memberId}:`, err);
            }
        }

        onCreated();
        onClose();
    } catch (e) {
        console.error("Group creation failed:", e);
        alert("Failed to establish secure group channel.");
    } finally {
        setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-6"
      >
        <motion.div 
          initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
          className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl relative"
        >
          {/* Header */}
          <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/2">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white italic">Create Secure Group</h3>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1">Multi-Party E2EE Protocol</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 bg-[#1a2332] hover:bg-[#252f44] rounded-xl transition-colors text-white shadow-lg">
                <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-8">
            {step === 1 ? (
              <div className="space-y-6">
                 <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                        type="text" 
                        placeholder="Search for nodes..." 
                        className="w-full bg-white/3 border border-white/10 rounded-2xl py-3.5 pl-11 pr-4 outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500/30 transition-all text-sm"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="h-64 overflow-y-auto space-y-2 pr-2 scrollbar-hide">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2 block ml-2">Available Identities</span>
                  {filteredUsers.map(u => (
                    <button 
                      key={u.$id}
                      onClick={() => toggleUser(u.user_id)}
                      className={`w-full p-4 rounded-2xl flex items-center gap-3 transition-all border ${selectedUsers.includes(u.user_id) ? 'bg-primary-500/10 border-primary-500/30' : 'bg-white/2 border-transparent hover:bg-white/5'}`}
                    >
                      <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center font-bold text-slate-400">
                        {(u.username || u.email || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-sm font-bold text-slate-200 truncate">{u.username || "Legacy Node"}</div>
                        <div className="text-[10px] text-slate-600 truncate">{u.email}</div>
                      </div>
                      {selectedUsers.includes(u.user_id) && (
                        <div className="w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center shadow-lg"><Check className="w-3.5 h-3.5 text-white" /></div>
                      )}
                    </button>
                  ))}
                </div>

                <button 
                    disabled={selectedUsers.length === 0}
                    onClick={() => setStep(2)}
                    className="w-full h-14 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center gap-3 text-sm font-black uppercase tracking-widest text-white transition-all disabled:opacity-50"
                >
                    Next Phase <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex flex-col items-center gap-4 py-4">
                     <div className="w-24 h-24 bg-linear-to-tr from-slate-800 to-slate-900 rounded-4xl border-2 border-dashed border-white/10 flex items-center justify-center text-slate-600">
                        <Users className="w-10 h-10" />
                     </div>
                     <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary-400">Identity Initialization</span>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Group Name</label>
                        <input 
                            type="text" 
                            className="w-full bg-white/3 border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500/30 transition-all text-sm font-bold text-white" 
                            placeholder="Enigma Core..."
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Description (Optional)</label>
                        <textarea 
                            className="w-full bg-white/3 border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500/30 transition-all text-sm font-medium text-slate-400 h-24 resize-none" 
                            placeholder="Encrypted group for project protocols..."
                            value={groupDesc}
                            onChange={(e) => setGroupDesc(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-1">Who can add new members?</label>
                        <div className="grid gap-3">
                            <button
                                type="button"
                                onClick={() => setMembersCanAdd(false)}
                                className={`w-full rounded-2xl border p-4 text-left transition-all ${!membersCanAdd ? 'bg-primary-500/10 border-primary-500/30 text-white' : 'bg-white/3 border-white/10 text-slate-400 hover:bg-white/5'}`}
                            >
                                <div className="text-sm font-black">Admins only</div>
                                <div className="mt-1 text-[10px] uppercase tracking-widest opacity-70">Only group admins can invite people.</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setMembersCanAdd(true)}
                                className={`w-full rounded-2xl border p-4 text-left transition-all ${membersCanAdd ? 'bg-primary-500/10 border-primary-500/30 text-white' : 'bg-white/3 border-white/10 text-slate-400 hover:bg-white/5'}`}
                            >
                                <div className="text-sm font-black">All members</div>
                                <div className="mt-1 text-[10px] uppercase tracking-widest opacity-70">Any member with access can invite people.</div>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button onClick={() => setStep(1)} className="flex-1 h-14 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">Back</button>
                    <button 
                        onClick={handleCreateGroup}
                        disabled={isCreating || !groupName.trim()}
                        className="flex-2 h-14 bg-linear-to-r from-primary-600 to-indigo-600 rounded-2xl flex items-center justify-center gap-3 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-primary-500/20 active:scale-95 transition-all"
                    >
                        {isCreating ? 'Finalizing Handshke...' : <><ShieldCheck className="w-5 h-5 fill-white/20" /> Initialize Channel</>}
                    </button>
                </div>

                <p className="text-[9px] text-center text-slate-700 font-bold uppercase tracking-widest leading-relaxed">
                    By initializing, a unique 256-bit AES key will be generated and distributed via RSA-4096 to all {selectedUsers.length + 1} participants. {membersCanAdd ? 'Any member can invite more people later.' : 'Only admins can invite more people later.'}
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
