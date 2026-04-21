import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { databases, storage, APPWRITE_CONFIG } from '../lib/appwrite';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Shield, Camera, Edit3, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { ID, Query } from 'appwrite';
import { useTheme } from '../hooks/useTheme';

interface ProfileSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { theme, changeTheme, THEMES } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState('');
  const [bio, setBio] = useState('');
  const [avatarId, setAvatarId] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [docId, setDocId] = useState('');

  useEffect(() => {
    if (isOpen && user) {
      fetchProfile();
    }
  }, [isOpen, user]);

  const fetchProfile = async () => {
    try {
      const res = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_USERS, [
        Query.equal("user_id", user?.$id)
      ]);
      if (res.total > 0) {
        const doc = res.documents[0];
        setDocId(doc.$id);
        setUsername(doc.username || '');
        setStatus(doc.status || 'Active');
        setBio(doc.bio || '');
        setAvatarId(doc.avatar_id || '');
        setPhone(doc.phone || '');
      }
    } catch (e) { console.error("Fetch profile failed", e); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const upload = await storage.createFile(APPWRITE_CONFIG.BUCKET_ID, ID.unique(), file);
      setAvatarId(upload.$id);
      if (docId) {
        await databases.updateDocument(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_USERS, docId, {
          avatar_id: upload.$id
        });
      }
    } catch (e) { console.error("Avatar upload failed", e); }
    setIsLoading(false);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      if (docId) {
        await databases.updateDocument(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_USERS, docId, {
        username,
        bio,
        phone
      });
      setIsEditing(false);
      }
    } catch (e) { console.error("Save profile failed", e); }
    setIsLoading(false);
  };

  const getAvatarUrl = () => {
    if (avatarId) {
        return `${APPWRITE_CONFIG.ENDPOINT}/storage/buckets/${APPWRITE_CONFIG.BUCKET_ID}/files/${avatarId}/view?project=${APPWRITE_CONFIG.PROJECT_ID}`;
    }
    return null;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-100 flex items-center justify-end bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div 
          initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="w-full max-w-md h-full bg-white border-l border-gray-200 p-8 shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-10">
            <div>
                <h2 className="text-2xl font-black italic tracking-tighter uppercase text-gray-900">Profile Settings</h2>
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Manage your profile</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500 hover:text-gray-900">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 space-y-10 overflow-y-auto pr-2 scrollbar-hide">
            {/* Avatar Section */}
            <div className="flex flex-col items-center space-y-4">
              <div className="relative group">
                <div className="w-32 h-32 rounded-[2.5rem] bg-gray-200 border border-gray-300 overflow-hidden flex items-center justify-center text-5xl font-bold shadow-2xl group-hover:scale-105 transition-transform">
                  {getAvatarUrl() ? (
                      <img src={getAvatarUrl()!} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                      <span className="text-blue-500">{username[0]?.toUpperCase() || 'U'}</span>
                  )}
                  {isLoading && <div className="absolute inset-0 bg-white/50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-900" /></div>}
                </div>
                <label className="absolute -bottom-2 -right-2 p-3 bg-blue-500 border border-gray-200 rounded-2xl text-white hover:bg-blue-400 transition-all shadow-xl cursor-pointer">
                  <Camera className="w-5 h-5" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                </label>
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold text-gray-900 tracking-tight">{username || 'Loading...'}</h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.3em] font-black">User ID: {user?.$id.slice(0, 16)}</p>
              </div>
            </div>

            {/* Info Grid */}
            <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Phone Number</label>
                  <div className="flex items-center px-6 py-4 bg-slate-50 rounded-3xl border border-slate-200 shadow-sm transition-all focus-within:border-primary-500 focus-within:bg-white group">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-slate-400 group-focus-within:text-primary-500 transition-colors"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.88 12.88 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={!isEditing}
                      placeholder="+1 234 567 890"
                      className="bg-transparent border-none outline-none text-sm text-slate-700 w-full ml-4 font-medium disabled:opacity-70"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">About / Bio</label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={username} onChange={(e) => setUsername(e.target.value)}
                    disabled={!isEditing}
                    className="w-full bg-gray-50 border border-gray-300 rounded-2xl py-4 pl-12 pr-6 outline-none transition-all text-sm text-gray-900 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Status</label>
                <div className="relative group">
                  <Edit3 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={status} onChange={(e) => setStatus(e.target.value)}
                    disabled={!isEditing}
                    className="w-full bg-gray-50 border border-gray-300 rounded-2xl py-4 pl-12 pr-6 outline-none transition-all text-sm text-gray-900 disabled:opacity-50"
                  />
                </div>
              </div>

<div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Bio</label>
                <div className="relative group">
                  <Shield className="absolute left-4 top-4 w-4 h-4 text-gray-500" />
                  <textarea
                    value={bio} onChange={(e) => setBio(e.target.value)}
                    disabled={!isEditing}
                    className="w-full bg-gray-50 border border-gray-300 rounded-2xl py-4 pl-12 pr-6 outline-none transition-all text-sm text-gray-900 disabled:opacity-50 h-28 resize-none"
                    placeholder="Tell us about yourself..."
                  />
                </div>
              </div>

              {/* Theme Section */}
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">App Theme</label>
                <div className="grid grid-cols-6 gap-2">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => changeTheme(t.id)}
                      className={`relative p-1.5 rounded-lg border-2 transition-all ${
                        theme === t.id 
                          ? 'border-gray-900 shadow-lg scale-105' 
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <div 
                        className="w-full h-6 rounded-md" 
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="text-[6px] font-black uppercase tracking-widest mt-0.5 block text-gray-600">
                        {t.name}
                      </span>
                      {theme === t.id && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                          <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-8 mt-auto border-t border-gray-200">
            {isEditing ? (
                <button
                onClick={handleSave}
                disabled={isLoading}
                className="w-full h-14 bg-blue-500 text-white rounded-2xl flex items-center justify-center gap-3 font-black uppercase tracking-widest transition-all shadow-xl shadow-blue-500/20"
                >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Save Changes</>}
                </button>
            ) : (
                <button
                onClick={() => setIsEditing(true)}
                className="w-full h-14 bg-gray-100 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-2xl flex items-center justify-center gap-3 font-black uppercase tracking-widest transition-all"
                >
                <Edit3 className="w-5 h-5" /> Edit Profile
                </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
