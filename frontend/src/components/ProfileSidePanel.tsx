import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image, Files, BellOff, Flag, ShieldCheck, Phone, Video, Search } from 'lucide-react';

interface ProfileSidePanelProps {
    isOpen: boolean;
    onClose: () => void;
    item: any; // User or Group
    messages: any[];
    getAvatarUrl: (id: string | null | undefined, bucketId?: string) => string | undefined;
    sharedGroups?: any[];
}

export const ProfileSidePanel: React.FC<ProfileSidePanelProps> = ({ 
    isOpen, 
    onClose, 
    item, 
    messages, 
    getAvatarUrl,
    sharedGroups = []
}) => {
    if (!item) return null;

    const isGroup = item.type === 'group' || !!item.group_id;
    const name = item.username || item.name || "Unknown";
    const bio = item.bio || item.description || (isGroup ? "Group description" : "Hey there! I'm using SecureVault.");
    const avatarUrl = getAvatarUrl(isGroup ? item.$id : item.avatar_id);

    // Filter shared media
    const mediaMessages = messages.filter(m => m.type === 'file' || m.type === 'voice' || m.gif_url);

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
                                <h2 className="text-lg font-bold text-slate-800">Contact Info</h2>
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
                                        {isGroup ? `${item.memberCount || 0} Members` : (item.status === 'online' ? 'Online' : 'Yesterday at 9:00 PM')}
                                    </p>
                                </div>

                                {/* Quick Actions */}
                                <div className="flex items-center gap-6 mt-8">
                                    {[
                                        { icon: <Phone />, label: 'Audio' },
                                        { icon: <Video />, label: 'Video' },
                                        { icon: <Search />, label: 'Search' },
                                    ].map((action, i) => (
                                        <button key={i} className="flex flex-col items-center gap-2 group">
                                            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 transition-all group-hover:bg-blue-600 group-hover:text-white shadow-sm">
                                                {React.cloneElement(action.icon as React.ReactElement<{ className?: string }>, { className: 'w-5 h-5' })}
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-blue-600 transition-colors">{action.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Info Sections */}
                            <div className="p-4 space-y-4 pb-12">
            {/* Bio Section */}
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

            <section className="bg-white p-6 rounded-4xl border border-slate-100 shadow-sm space-y-4">
                                    <div className="space-y-1">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">About / Status</h4>
                                        <p className="text-sm text-slate-700 leading-relaxed font-medium">{bio}</p>
                                    </div>
                                    <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest pt-2">Updated: Dec 12, 2026</p>
                                </section>

                                {/* Media Section */}
                                <section className="bg-white p-6 rounded-4xl border border-slate-100 shadow-sm space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500">
                                                <Image className="w-4 h-4" />
                                            </div>
                                            <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-700">Media, Links and Docs</h4>
                                        </div>
                                        <button className="text-[10px] font-black text-blue-500 hover:underline uppercase tracking-widest">
                                            {mediaMessages.length} items
                                        </button>
                                    </div>
                                    
                                    {mediaMessages.length > 0 ? (
                                        <div className="grid grid-cols-3 gap-2">
                                            {mediaMessages.slice(0, 6).map((m, i) => (
                                                <div key={i} className="aspect-square bg-slate-100 rounded-xl overflow-hidden border border-slate-200 group relative cursor-pointer">
                                                    {m.gif_url ? (
                                                        <img src={m.gif_url} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                                                            {m.type === 'voice' ? <Mic className="w-5 h-5" /> : <Files className="w-5 h-5" />}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-slate-400 font-medium italic text-center py-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">No media shared yet</p>
                                    )}
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
                                    <button className="text-[10px] font-black text-blue-500 uppercase tracking-widest hover:underline">
                                        Verify Security Code
                                    </button>
                                </section>

                                {/* Groups In Common */}
                                {!isGroup && (
                                    <section className="bg-white p-6 rounded-4xl border border-slate-100 shadow-sm space-y-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                                                <UsersIcon className="w-4 h-4" />
                                            </div>
                                            <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-700">Groups in Common</h4>
                                        </div>
                                        <div className="space-y-4">
                                            {sharedGroups.length > 0 ? sharedGroups.map((g, i) => (
                                                <div key={i} className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center text-xs font-bold">
                                                        {g.avatar ? <img src={g.avatar} className="w-full h-full object-cover" /> : g.name[0]}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-800">{g.name}</p>
                                                        <p className="text-[10px] text-slate-400 font-medium">{g.members} Members</p>
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
                                    <button className="w-full h-14 bg-white border border-slate-200 rounded-2xl flex items-center gap-4 px-6 text-red-500 font-bold hover:bg-red-50 transition-colors">
                                        <BellOff className="w-5 h-5" />
                                        <span className="text-sm">Mute Notifications</span>
                                    </button>
                                    <button className="w-full h-14 bg-white border border-slate-200 rounded-2xl flex items-center gap-4 px-6 text-red-500 font-bold hover:bg-red-50 transition-colors">
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

// Internal icon helpers
const UsersIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
);

const Mic = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
    </svg>
);
