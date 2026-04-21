import React from 'react';
import { motion } from 'framer-motion';
import { Users, Lock } from 'lucide-react';

interface SidebarChatItemProps {
    item: any;
    isSelected: boolean;
    onClick: () => void;
    lastMessage?: {
        text: string;
        timestamp: string;
        sender_id: string;
    };
    unreadCount: number;
    isOnline?: boolean;
    getAvatarUrl: (id: string | null | undefined) => string | undefined;
}

export const SidebarChatItem: React.FC<SidebarChatItemProps> = ({ 
    item, isSelected, onClick, lastMessage, unreadCount, isOnline, getAvatarUrl 
}) => {
    const isGroup = item.type === 'group';
    const name = item.username || item.name || 'Unknown';
    const initials = name[0].toUpperCase();

    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-4 p-4 rounded-3xl transition-all relative group ${isSelected ? 'bg-blue-600 shadow-xl shadow-blue-600/20' : 'hover:bg-slate-50'}`}
        >
            {/* Avatar Section */}
            <div className="relative shrink-0">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden border-2 transition-transform group-hover:scale-105 ${isSelected ? 'border-white/20 bg-white/10' : 'border-slate-100 bg-slate-50'}`}>
                    {isGroup ? (
                        item.avatar_id ? (
                            <img src={getAvatarUrl(item.avatar_id)} alt="" className="w-full h-full object-cover" />
                        ) : <Users className={`w-6 h-6 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                    ) : (
                        item.avatar_id ? (
                            <img src={getAvatarUrl(item.avatar_id)} alt="" className="w-full h-full object-cover" />
                        ) : <span className={`text-xl font-black ${isSelected ? 'text-white' : 'text-slate-400'}`}>{initials}</span>
                    )}
                </div>
                
                {/* Online Status Dot */}
                {!isGroup && (
                    <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-4 ${isSelected ? 'border-blue-600' : 'border-white'} ${isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                )}
            </div>

            {/* Info Section */}
            <div className="flex-1 text-left min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className={`font-black tracking-tight text-sm truncate ${isSelected ? 'text-white' : 'text-slate-950'}`}>
                        {name}
                    </h4>
                    {lastMessage && (
                        <span className={`text-[10px] font-bold shrink-0 ${isSelected ? 'text-white/60' : 'text-slate-400'}`}>
                            {new Date(lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                </div>

                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                        {lastMessage && <Lock className={`w-3 h-3 shrink-0 ${isSelected ? 'text-white/40' : 'text-slate-300'}`} />}
                        <p className={`text-xs truncate font-medium ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                            {lastMessage ? lastMessage.text : (isGroup ? 'Encrypted Channel' : 'Ready for dispatch')}
                        </p>
                    </div>

                    {unreadCount > 0 && (
                        <motion.span 
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            className={`min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-black ${isSelected ? 'bg-white text-blue-600' : 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'}`}
                        >
                            {unreadCount}
                        </motion.span>
                    )}
                </div>
            </div>

            {/* Interaction Indicator */}
            {isSelected && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-white rounded-l-full" />
            )}
        </button>
    );
};
