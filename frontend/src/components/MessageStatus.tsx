import React from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * WhatsApp-style Message Status Indicators
 * Sent: Single check (gray)
 * Delivered: Double check (gray)
 * Read: Double check (blue)
 */
export const MessageStatus: React.FC<{ status: 'sent' | 'delivered' | 'read' }> = ({ status }) => {
    return (
        <div className="flex items-center -space-x-1.5 translate-y-px">
            <AnimatePresence mode="wait">
                {status === 'sent' ? (
                    <motion.div
                        key="sent"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 0.5, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                    >
                        <Check className="w-3 h-3 text-slate-400" />
                    </motion.div>
                ) : (
                    <motion.div
                        key={status}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: status === 'read' ? 1 : 0.5, scale: 1 }}
                        className="flex -space-x-1.5"
                    >
                        <CheckCheck className={`w-3.5 h-3.5 ${status === 'read' ? 'text-sky-400' : 'text-slate-400'}`} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

interface ReactionPickerProps {
    onSelect: (emoji: string) => void;
    onClose: () => void;
}

export const ReactionPicker: React.FC<ReactionPickerProps> = ({ onSelect, onClose }) => {
    const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="absolute -top-14 left-0 flex items-center gap-1.5 p-2 bg-slate-900/90 backdrop-blur-3xl border border-white/10 rounded-full shadow-3xl z-50 px-3"
            onMouseLeave={onClose}
        >
            {reactions.map((emoji) => (
                <button 
                key={emoji} 
                onClick={() => { onSelect(emoji); onClose(); }} 
                className="text-xl hover:scale-125 transition-transform p-1.5 rounded-full hover:bg-white/5"
                >
                {emoji}
                </button>
            ))}
        </motion.div>
    );
};
