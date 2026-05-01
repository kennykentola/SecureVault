import React, { useState, useEffect } from 'react';
import { Phone, Video, ArrowUpRight, ArrowDownLeft, Loader2, Search } from 'lucide-react';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { Query } from 'appwrite';

interface CallHistoryProps {
    user: any;
    onStartCall: (id: string, type: 'voice' | 'video', name: string) => void;
}

export const CallHistory: React.FC<CallHistoryProps> = ({ user, onStartCall }) => {
    const [calls, setCalls] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        fetchCallHistory();
    }, [user?.$id]);

    const fetchCallHistory = async () => {
        if (!user?.$id) return;
        setIsLoading(true);
        try {
            // Fetch messages of type 'call' involving the current user
            const [sent, received] = await Promise.all([
                databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_MESSAGES, [
                    Query.equal("sender_id", user.$id),
                    Query.equal("type", "call"),
                    Query.orderDesc("timestamp"),
                    Query.limit(50)
                ]),
                databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_MESSAGES, [
                    Query.equal("receiver_id", user.$id),
                    Query.equal("type", "call"),
                    Query.orderDesc("timestamp"),
                    Query.limit(50)
                ])
            ]);

            const allCalls = [...sent.documents, ...received.documents].sort((a, b) => 
                new Date(b.timestamp || b.$createdAt).getTime() - new Date(a.timestamp || a.$createdAt).getTime()
            );

            // Fetch user info for each call participant
            const participantIds = [...new Set(allCalls.map(c => c.sender_id === user.$id ? c.receiver_id : c.sender_id))];
            const participantsMap: Record<string, any> = {};

            if (participantIds.length > 0) {
                const usersRes = await databases.listDocuments(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTION_USERS, [
                    Query.equal("user_id", participantIds),
                    Query.limit(100)
                ]);
                usersRes.documents.forEach(u => {
                    participantsMap[u.user_id] = u;
                });
            }

            setCalls(allCalls.map(c => ({
                ...c,
                participant: participantsMap[c.sender_id === user.$id ? c.receiver_id : c.sender_id] || { username: 'Unknown User' }
            })));
        } catch (e) {
            console.error("Failed to fetch call history", e);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredCalls = calls.filter(c => 
        c.participant.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.participant.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (isLoading) return (
        <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
    );

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
            {/* Search Header */}
            <div className="p-4 bg-white border-b border-slate-100 shrink-0">
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                    <input 
                        type="text" 
                        placeholder="Search logs..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-11 pr-4 py-3 text-sm focus:bg-white focus:border-blue-500/50 outline-none transition-all font-medium"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                {filteredCalls.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 opacity-40">
                        <div className="w-16 h-16 bg-slate-200 rounded-3xl flex items-center justify-center text-slate-400">
                            <Phone className="w-8 h-8" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-600">Secure Logs Clear</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">No encrypted call signals detected</p>
                        </div>
                    </div>
                ) : (
                    filteredCalls.map((call) => {
                        const isOutgoing = call.sender_id === user.$id;
                        const isVideo = call.text === 'video';
                        const time = new Date(call.timestamp || call.$createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const date = new Date(call.timestamp || call.$createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' });

                        return (
                            <div key={call.$id} className="bg-white border border-slate-100 p-4 rounded-3xl flex items-center gap-4 hover:shadow-md transition-all group">
                                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-600 font-bold overflow-hidden shadow-sm">
                                    {call.participant.username?.[0] || 'U'}
                                </div>
                                <div className="flex-1 text-left">
                                    <h5 className="text-sm font-black text-slate-800">{call.participant.username || call.participant.name || 'Unknown'}</h5>
                                    <div className="flex items-center gap-2 mt-1">
                                        {isOutgoing ? (
                                            <ArrowUpRight className="w-3 h-3 text-blue-500" />
                                        ) : (
                                            <ArrowDownLeft className="w-3 h-3 text-green-500" />
                                        )}
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                            {isOutgoing ? 'Outgoing' : 'Incoming'} • {date}, {time}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => onStartCall(call.participant.user_id, isVideo ? 'video' : 'voice', call.participant.username)}
                                        className="p-3 bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-2xl transition-all"
                                    >
                                        {isVideo ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
            
            <div className="p-6 bg-slate-50/50 text-center shrink-0">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] leading-loose">
                    All secure calls are end-to-end encrypted.<br/>SecureVault does not record audio or video.
                </p>
            </div>
        </div>
    );
};
