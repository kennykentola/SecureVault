import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, User as UserIcon, Mail, Phone, MessageSquare, Loader2, Sparkles } from 'lucide-react';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { Query } from 'appwrite';

interface FindUsersModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectUser: (user: any) => void;
    currentUser: any;
}

export const FindUsersModal: React.FC<FindUsersModalProps> = ({ isOpen, onClose, onSelectUser, currentUser }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (!query || query.length < 2) {
            setResults([]);
            return;
        }

        const search = async () => {
            setIsSearching(true);
            try {
                // Use Query.search for full-text searching if available, 
                // or Query.equal/contains if indexes are standard.
                // Since we created FT indexes, Query.search is often the intended method.
                const res = await databases.listDocuments(
                    APPWRITE_CONFIG.DATABASE_ID,
                    APPWRITE_CONFIG.COLLECTION_USERS,
                    [
                        Query.or([
                            Query.search("username", query),
                            Query.search("email", query),
                            Query.search("phone", query)
                        ]),
                        Query.limit(10)
                    ]
                );

                // Filter out current user
                const filtered = res.documents.filter(doc => (doc.user_id || doc.$id) !== currentUser?.$id);
                setResults(filtered);
            } catch (e) {
                console.error("Search failed", e);
                // Fallback to simpler contains if Search fails
                try {
                    const res = await databases.listDocuments(
                        APPWRITE_CONFIG.DATABASE_ID,
                        APPWRITE_CONFIG.COLLECTION_USERS,
                        [
                            Query.or([
                                Query.contains("username", query.toLowerCase()),
                                Query.contains("email", query.toLowerCase()),
                                Query.contains("phone", query)
                            ]),
                            Query.limit(10)
                        ]
                    );
                    const filtered = res.documents.filter(doc => (doc.user_id || doc.$id) !== currentUser?.$id);
                    setResults(filtered);
                } catch (err2) {
                    console.error("Fallback search failed", err2);
                }
            } finally {
                setIsSearching(false);
            }
        };

        const timeout = setTimeout(search, 400);
        return () => clearTimeout(timeout);
    }, [query, currentUser]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden"
                    >
                        {/* Header */}
                        <div className="px-8 pt-8 pb-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-primary-100 flex items-center justify-center text-primary-600">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Find People</h2>
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Search by name, email or phone</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 bg-[#1a2332] hover:bg-[#252f44] rounded-xl transition-colors text-white shadow-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Search Input */}
                        <div className="px-8 pb-6">
                            <div className="relative group">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Username, email or +123..."
                                    className="w-full h-14 bg-slate-50 border border-slate-200 rounded-3xl pl-14 pr-6 outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all text-slate-800 font-medium"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                />
                                {isSearching && (
                                    <div className="absolute right-5 top-1/2 -translate-y-1/2">
                                        <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Results List */}
                        <div className="max-h-[400px] overflow-y-auto px-8 pb-8 space-y-3 custom-scrollbar">
                            {results.length > 0 ? (
                                results.map((u) => (
                                    <motion.button
                                        key={u.$id}
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.99 }}
                                        onClick={() => {
                                            onSelectUser(u);
                                            onClose();
                                        }}
                                        className="w-full p-4 flex items-center justify-between bg-slate-50 hover:bg-white rounded-3xl border border-slate-100 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-500/5 transition-all group group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-slate-200 overflow-hidden">
                                                {u.avatar_id ? (
                                                    <img src={`${APPWRITE_CONFIG.ENDPOINT}/storage/buckets/${APPWRITE_CONFIG.BUCKET_ID}/files/${u.avatar_id}/view?project=${APPWRITE_CONFIG.PROJECT_ID}`} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center font-bold text-slate-400 uppercase">{u.username[0]}</div>
                                                )}
                                            </div>
                                            <div className="text-left">
                                                <h3 className="font-bold text-slate-900 group-hover:text-primary-600 transition-colors">{u.username}</h3>
                                                <div className="flex items-center gap-3 text-[10px] font-medium text-slate-500">
                                                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {u.email}</span>
                                                    {u.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {u.phone}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:bg-primary-500 group-hover:border-primary-500 group-hover:text-white transition-all">
                                            <MessageSquare className="w-5 h-5" />
                                        </div>
                                    </motion.button>
                                ))
                            ) : query.length >= 2 && !isSearching ? (
                                <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-4">
                                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center border border-dashed border-slate-300">
                                        <UserIcon className="w-8 h-8 opacity-20" />
                                    </div>
                                    <p className="text-sm font-medium">No one found with that info</p>
                                </div>
                            ) : null}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
