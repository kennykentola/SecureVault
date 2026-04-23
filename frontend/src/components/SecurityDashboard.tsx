import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Zap, Globe, Activity, Eye } from 'lucide-react';

interface SecurityDashboardProps {
    messages: any[];
}

export const SecurityDashboard: React.FC<SecurityDashboardProps> = ({ messages }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'metrics' | 'mitm' | 'protocol'>('metrics');
    const [networkLatency, setNetworkLatency] = useState<number>(0);

    useEffect(() => {
        // Simulate network latency fluctuations
        const interval = setInterval(() => {
            setNetworkLatency(Math.floor(Math.random() * 50) + 20);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const avgEncryptionTime = messages
        .filter(m => m.latency)
        .reduce((acc, m, _, arr) => acc + m.latency / arr.length, 0);

    return (
        <div className="hidden md:block fixed bottom-6 left-6 z-100">
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(!isOpen)}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-colors ${
                    isOpen ? 'bg-primary-600 text-white' : 'bg-white text-primary-600 border border-primary-500/30'
                }`}
            >
                {isOpen ? <Shield className="w-6 h-6" /> : <Activity className="w-6 h-6 animate-pulse" />}
            </motion.button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20, x: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20, x: -20 }}
                        className="absolute bottom-20 left-0 w-80 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl"
                    >
                        <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-primary-400" />
                                <span className="text-xs font-black uppercase tracking-widest text-slate-200">Security Insights</span>
                            </div>
                            <div className="flex bg-slate-900 rounded-lg p-1">
                                <button 
                                    onClick={() => setActiveTab('metrics')}
                                    className={`px-2 py-1 text-[8px] font-bold rounded-md transition-colors ${activeTab === 'metrics' ? 'bg-primary-600 text-white' : 'text-white bg-white/10 hover:bg-white/20'}`}
                                >
                                    Metrics
                                </button>
                                <button 
                                    onClick={() => setActiveTab('protocol')}
                                    className={`px-2 py-1 text-[8px] font-bold rounded-md transition-colors ${activeTab === 'protocol' ? 'bg-primary-600 text-white' : 'text-white bg-white/10 hover:bg-white/20'}`}
                                >
                                    Protocol
                                </button>
                                <button 
                                    onClick={() => setActiveTab('mitm')}
                                    className={`px-2 py-1 text-[8px] font-bold rounded-md transition-colors ${activeTab === 'mitm' ? 'bg-red-600 text-white' : 'text-white bg-white/10 hover:bg-white/20'}`}
                                >
                                    MITM
                                </button>
                            </div>
                        </div>

                        <div className="p-5 max-h-[400px] overflow-y-auto custom-scrollbar">
                            {activeTab === 'metrics' ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-3 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Zap className="w-3 h-3 text-yellow-400" />
                                                <span className="text-[9px] font-black uppercase text-slate-400">Crypto Latency</span>
                                            </div>
                                            <p className="text-lg font-mono font-bold text-white">
                                                {avgEncryptionTime > 0 ? avgEncryptionTime.toFixed(2) : '0.00'}<span className="text-[10px] text-slate-500 ml-1">ms</span>
                                            </p>
                                        </div>
                                        <div className="p-3 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Globe className="w-3 h-3 text-blue-400" />
                                                <span className="text-[9px] font-black uppercase text-slate-400">Net Response</span>
                                            </div>
                                            <p className="text-lg font-mono font-bold text-white">
                                                {networkLatency}<span className="text-[10px] text-slate-500 ml-1">ms</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 px-1">Active Protocols</p>
                                        <div className="space-y-1.5">
                                            {[
                                                { label: 'Symmetric', val: 'AES-256-CBC', color: 'bg-green-500' },
                                                { label: 'Asymmetric', val: 'RSA-OAEP 2048', color: 'bg-blue-500' },
                                                { label: 'Hashing', val: 'SHA-256', color: 'bg-purple-500' },
                                                { label: 'Key Exchange', val: 'Hybrid RSA/AES', color: 'bg-orange-500' }
                                            ].map((item, i) => (
                                                <div key={i} className="flex items-center justify-between p-2 bg-slate-800/30 rounded-xl">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
                                                        <span className="text-[10px] font-bold text-slate-300">{item.label}</span>
                                                    </div>
                                                    <span className="text-[10px] font-mono text-slate-500">{item.val}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : activeTab === 'protocol' ? (
                                <div className="space-y-4">
                                    <div className="flex flex-col gap-3">
                                        {[
                                            { step: 1, title: 'Plaintext Generation', desc: 'Message content is encoded into a byte array.' },
                                            { step: 2, title: 'AES-256 Symmetric Encryption', desc: 'Generate a random Session Key and IV to encrypt content.' },
                                            { step: 3, title: 'RSA-2048 Asymmetric Wrapping', desc: 'Session Key is encrypted with Recipient\'s Public Key.' },
                                            { step: 4, title: 'SHA-256 Integrity Check', desc: 'A hash is generated to detect any future tampering.' },
                                            { step: 5, title: 'Combined Packet Delivery', desc: 'Wrapped Key + Ciphertext + IV + Hash sent as one packet.' }
                                        ].map((item, i) => (
                                            <div key={i} className="relative pl-6 border-l border-slate-700 pb-2 last:pb-0">
                                                <div className="absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full bg-primary-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                                <p className="text-[10px] font-black text-white uppercase tracking-tight mb-1">{item.title}</p>
                                                <p className="text-[9px] text-slate-400 leading-snug">{item.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="p-3 bg-primary-600/10 border border-primary-500/20 rounded-2xl">
                                        <p className="text-[9px] font-bold text-primary-400 leading-tight">
                                            Hybrid Cryptography ensures speed (AES) and security (RSA) are perfectly balanced.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl">
                                        <Eye className="w-4 h-4 text-red-500 shrink-0" />
                                        <p className="text-[10px] leading-tight text-red-200">
                                            Intercepted database records (Ciphertexts) captured from the network stream.
                                        </p>
                                    </div>

                                    <div className="bg-black/40 rounded-2xl p-3 font-mono text-[10px] space-y-3 max-h-48 overflow-y-auto border border-slate-800 scrollbar-hide">
                                        {messages.length === 0 ? (
                                            <p className="text-slate-600 italic">Waiting for network traffic...</p>
                                        ) : (
                                            [...messages].slice(-3).map((m, i) => (
                                                <div key={i} className="space-y-1 pb-2 border-b border-slate-800 last:border-0">
                                                    <p className="text-red-500/70 uppercase text-[8px] font-black tracking-widest">Packet Intercepted</p>
                                                    <div className="grid grid-cols-[50px_1fr] gap-1 text-slate-400">
                                                        <span>CIPHER:</span> <span className="text-slate-200 truncate">{m.ciphertext || "[BINARY]"}</span>
                                                        <span>HASH:</span> <span className="text-red-500/50 truncate">{m.hash}</span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    
                                    <div className="flex items-center gap-2 justify-center">
                                        <div className="flex gap-1">
                                            {[1, 2, 3].map(i => (
                                                <motion.div 
                                                    key={i}
                                                    animate={{ opacity: [0.2, 1, 0.2] }}
                                                    transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                                                    className="w-1.5 h-1.5 rounded-full bg-red-500" 
                                                />
                                            ))}
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-red-500/70">Monitoring Active</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
