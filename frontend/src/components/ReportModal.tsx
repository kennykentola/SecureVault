import React, { useState } from 'react';
import { databases, APPWRITE_CONFIG } from '../lib/appwrite';
import { ID } from 'appwrite';
import { X, Flag, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

interface ReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    targetId: string;
    targetName: string;
    type: 'user' | 'group';
}

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, targetId, targetName, type }) => {
    const { user } = useAuth();
    const [reason, setReason] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSubmit = async () => {
        if (!reason.trim()) return;
        setIsLoading(true);
        try {
            await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, "reports", ID.unique(), {
                reporter_id: user?.$id,
                reported_user_id: type === 'user' ? targetId : '',
                group_id: type === 'group' ? targetId : '',
                reason,
                status: 'pending',
                timestamp: new Date().toISOString()
            });
            setIsSuccess(true);
            setTimeout(() => {
                onClose();
                setIsSuccess(false);
                setReason("");
            }, 2000);
        } catch (e) {
            console.error(e);
        }
        setIsLoading(false);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-md p-6"
            >
                <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                    className="w-full max-w-md bg-white rounded-[2.5rem] overflow-hidden shadow-2xl"
                >
                    <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                                <Flag className="w-5 h-5 text-red-600" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Report {type === 'group' ? 'Channel' : 'Operative'}</h3>
                                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">Safety & Governance Protocol</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 bg-[#1a2332] hover:bg-[#252f44] rounded-xl transition-colors text-white shadow-lg">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="p-8">
                        {isSuccess ? (
                            <div className="py-10 text-center animate-in fade-in zoom-in duration-300">
                                <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-6" />
                                <h4 className="text-2xl font-black text-gray-900 mb-2">Report Transmitted</h4>
                                <p className="text-sm text-gray-500 font-medium">Global moderation will review this artifact.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex gap-4">
                                    <AlertTriangle className="w-10 h-10 text-amber-500 shrink-0" />
                                    <p className="text-[11px] text-amber-800 font-bold leading-relaxed uppercase tracking-wide">
                                        You are reporting <span className="font-black">"{targetName}"</span>. This action will flag the identity for administrative review.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Violation Details</label>
                                    <textarea 
                                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-6 outline-none focus:ring-4 focus:ring-red-100 focus:border-red-300 transition-all text-sm h-32 resize-none"
                                        placeholder="Describe the nature of the violation..."
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                    />
                                </div>

                                <button 
                                    onClick={handleSubmit}
                                    disabled={isLoading || !reason.trim()}
                                    className="w-full h-14 bg-red-600 hover:bg-red-700 text-white rounded-2xl flex items-center justify-center gap-3 text-sm font-black uppercase tracking-widest shadow-xl shadow-red-600/20 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Flag className="w-5 h-5" /> Submit Intelligence</>}
                                </button>
                                
                                <p className="text-[9px] text-center text-gray-400 font-bold uppercase tracking-widest">
                                    False reporting may lead to identity suspension.
                                </p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
