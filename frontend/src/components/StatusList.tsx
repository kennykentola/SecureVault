import React, { useState, useEffect } from 'react';
import { Plus, Globe, Clock, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { Query } from 'appwrite';

interface StatusListProps {
    user: any;
    onAdd: () => void;
    onView: (statuses: any[], index: number) => void;
    refreshTrigger?: number;
}

export const StatusList: React.FC<StatusListProps> = ({ user, onAdd, onView, refreshTrigger }) => {
    const [myStatuses, setMyStatuses] = useState<any[]>([]);
    const [friendStatuses, setFriendStatuses] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchStatuses();
    }, [refreshTrigger, user?.$id]);

    const fetchStatuses = async () => {
        if (!user?.$id) {
            setMyStatuses([]);
            setFriendStatuses([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const now = new Date().toISOString();
            const myDisplayName = user?.username || user?.name || 'You';
            
            // 1. Fetch my statuses
            const myRes = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, "statuses", [
                Query.equal("user_id", user.$id),
                Query.greaterThan("expires_at", now),
                Query.orderDesc("created_at")
            ]);
            setMyStatuses(myRes.documents.map(status => ({
                ...status,
                userName: status.userName || myDisplayName
            })));

            // 2. Fetch friend statuses
            const friendRes = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, "statuses", [
                Query.notEqual("user_id", user.$id),
                Query.greaterThan("expires_at", now),
                Query.orderDesc("created_at")
            ]);

            // 3. Fetch users who have shared their status key with us
            let allowedPosterIds: string[] = [];
            try {
                const keysRes = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, "status_keys", [
                    Query.equal("recipient_id", user.$id),
                    Query.limit(100)
                ]);
                allowedPosterIds = keysRes.documents.map(d => d.poster_id);
            } catch (e) {
                console.warn("Failed to fetch status keys for filtering", e);
            }

            // Filter out statuses that exclude me AND those we don't have a decryption key for
            const visibleStatuses = friendRes.documents.filter(s => 
                !s.excluded_users?.includes(user.$id) && allowedPosterIds.includes(s.user_id)
            );

            // Group by user
            const grouped: Record<string, any[]> = {};
            for (const s of visibleStatuses) {
                if (!grouped[s.user_id]) {
                    // Fetch user info for display
                    try {
                        const uRes = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_USERS, [
                            Query.equal("user_id", s.user_id)
                        ]);
                        const uInfo = uRes.documents[0];
                        grouped[s.user_id] = [{ ...s, userName: uInfo?.username }];
                    } catch {
                        grouped[s.user_id] = [{ ...s, userName: 'Agent X' }];
                    }
                } else {
                    grouped[s.user_id].push({ ...s, userName: grouped[s.user_id][0].userName });
                }
            }
            setFriendStatuses(Object.values(grouped));

        } catch (e) { console.error(e); }
        setIsLoading(false);
    };

    if (isLoading) return (
        <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
    );

    return (
        <div className="flex-1 flex flex-col space-y-8 p-4 overflow-y-auto custom-scrollbar pb-10">
            {/* My Status Section */}
            <section className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">My Channel</h4>
                <div
                    onClick={() => (myStatuses.length > 0 ? onView(myStatuses, 0) : onAdd())}
                    className="bg-white border border-slate-200 rounded-4xl p-5 flex items-center gap-4 hover:shadow-lg transition-all cursor-pointer group active:scale-95 shadow-sm"
                >
                    <div className="relative">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-lg border-2 ${myStatuses.length > 0 ? 'border-blue-500' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                            {myStatuses.length > 0 ? (
                                myStatuses[0].type === 'text' ? (
                                    <div className="w-full h-full rounded-xl flex items-center justify-center text-xs" style={{ backgroundColor: myStatuses[0].background_color }}>Story</div>
                                ) : <div className="w-full h-full rounded-xl bg-slate-200" />
                            ) : (user?.username?.[0] || user?.name?.[0] || 'U')}
                        </div>
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onAdd();
                            }}
                            className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center border-2 border-white shadow-md text-white group-hover:scale-110 transition-transform"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex-1">
                        <h5 className="text-sm font-black text-slate-800">Post Intelligence</h5>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                            {myStatuses.length > 0 ? `Active: ${myStatuses.length} Artifacts` : 'Update your status'}
                        </p>
                    </div>
                </div>
            </section>

            {/* Friend Updates Section */}
            <section className="space-y-4">
                <div className="flex items-center justify-between px-2">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Identity Updates</h4>
                    <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full uppercase">{friendStatuses.length} New</span>
                </div>

                <div className="space-y-2">
                    {friendStatuses.length === 0 ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                            <Globe className="w-12 h-12 text-slate-300" />
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">No active signals in network</p>
                        </div>
                    ) : (
                        friendStatuses.map((group, idx) => (
                            <button 
                                key={idx}
                                onClick={() => onView(group, 0)}
                                className="w-full bg-white border border-slate-100 p-4 rounded-3xl flex items-center gap-4 hover:shadow-md hover:border-blue-200 transition-all active:scale-[0.98]"
                            >
                                <div className="p-1 rounded-[1.2rem] border-2 border-blue-500">
                                    <div className="w-12 h-12 bg-slate-100 rounded-[0.9rem] flex items-center justify-center text-blue-600 overflow-hidden font-bold">
                                        {group[0].userName?.[0] || 'U'}
                                    </div>
                                </div>
                                <div className="flex-1 text-left">
                                    <h5 className="text-sm font-black text-slate-800">{group[0].userName || 'Unknown'}</h5>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <Clock className="w-3 h-3 text-slate-400" />
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                            {new Date(group[0].created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-300" />
                            </button>
                        ))
                    )}
                </div>
            </section>

            {/* Viewed Updates placeholder */}
            <section className="space-y-4 opacity-50">
                 <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Verified Artifacts</h4>
                 <div className="px-4 py-8 text-center bg-slate-50 rounded-[2.5rem] border border-slate-100">
                    <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">No artifact history</p>
                 </div>
            </section>
        </div>
    );
};
