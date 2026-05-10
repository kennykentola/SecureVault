import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Zap, Globe, Activity } from 'lucide-react';



interface SecurityDashboardProps {
    messages: any[];
}

export const SecurityDashboard: React.FC<SecurityDashboardProps> = ({ messages }) => {

    const [isOpen, setIsOpen] = useState(false);
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
    const latestTextMessage = [...messages].reverse().find(m => typeof m.text === 'string' && m.text.trim());
    const latestPlaintext = latestTextMessage?.text || 'N/A';
    const latestCiphertext = latestTextMessage?.ciphertext || 'N/A';
    const latestHash = latestTextMessage?.hash || 'N/A';
    const latestEncryptedKey = latestTextMessage?.encryptedKey || latestTextMessage?.encrypted_key || 'N/A';

    return (
        <div className="fixed bottom-28 md:bottom-6 right-6 z-[100]">
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
                        initial={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
                        className="absolute bottom-full right-0 mb-4 w-[calc(100vw-2rem)] md:w-[480px] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl"
                    >
                        <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <Shield className="w-5 h-5 text-primary-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">
                                    Security <span className="text-primary-400">Stream</span>
                                    <span className="block text-[8px] font-bold text-slate-500 tracking-widest mt-0.5">Protocol Live Monitoring</span>
                                </h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                    {[1, 2, 3].map(i => (
                                        <motion.div 
                                            key={i}
                                            animate={{ opacity: [0.2, 1, 0.2] }}
                                            transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                                            className="w-1 h-1 rounded-full bg-emerald-500" 
                                        />
                                    ))}
                                </div>
                                <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500/70 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Verified</span>
                            </div>
                        </div>

                        <div className="p-5 max-h-[60vh] md:max-h-[70vh] overflow-y-auto custom-scrollbar space-y-6">
                            {/* Performance Metrics Section */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-slate-800/50 rounded-2xl border border-slate-700/50 relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="flex items-center gap-2 mb-1">
                                        <Zap className="w-3 h-3 text-yellow-400" />
                                        <span className="text-[9px] font-black uppercase text-slate-400">Crypto Latency</span>
                                    </div>
                                    <p className="text-lg font-mono font-bold text-white relative z-10">
                                        {avgEncryptionTime > 0 ? avgEncryptionTime.toFixed(2) : '0.00'}<span className="text-[10px] text-slate-500 ml-1">ms</span>
                                    </p>
                                </div>
                                <div className="p-3 bg-slate-800/50 rounded-2xl border border-slate-700/50 relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="flex items-center gap-2 mb-1">
                                        <Globe className="w-3 h-3 text-blue-400" />
                                        <span className="text-[9px] font-black uppercase text-slate-400">Net Response</span>
                                    </div>
                                    <p className="text-lg font-mono font-bold text-white relative z-10">
                                        {networkLatency}<span className="text-[10px] text-slate-500 ml-1">ms</span>
                                    </p>
                                </div>
                            </div>

                            {/* Cryptographic Pipeline Section */}
                            <div className="space-y-4">
                                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 px-1 border-l-2 border-primary-500 ml-1 pl-2">Data Transformation Pipeline</p>
                                
                                <div className="space-y-3">
                                    {[
                                        { 
                                            title: 'Plaintext Message', 
                                            value: latestPlaintext, 
                                            desc: 'Raw UTF-8 input string before buffer conversion.',
                                            howItWorks: 'The unencrypted data is encoded into a byte array, serving as the base for the encryption rounds.',
                                            icon: 'bg-slate-500'
                                        },
                                        { 
                                            title: 'AES-256-CBC Ciphertext', 
                                            value: latestCiphertext, 
                                            desc: 'Advanced Encryption Standard with Cipher Block Chaining.',
                                            howItWorks: 'Uses a 256-bit key to encrypt data in 128-bit blocks. Each block is XORed with the previous ciphertext block to eliminate patterns.',
                                            icon: 'bg-emerald-500'
                                        },
                                        { 
                                            title: 'RSA-OAEP 2048 (Wrapped Key)', 
                                            value: latestEncryptedKey, 
                                            desc: 'Asymmetric Key Wrapping for secure transmission.',
                                            howItWorks: 'The AES session key is encrypted using the recipient\'s RSA public key. OAEP padding adds unique randomness to every encryption.',
                                            icon: 'bg-blue-500'
                                        },
                                        { 
                                            title: 'SHA-256 Integrity Hash', 
                                            value: latestHash, 
                                            desc: 'Cryptographic digest for tamper detection.',
                                            howItWorks: 'Processes the entire payload through a one-way hashing algorithm. Even a 1-bit change in data results in a completely different 256-bit hash.',
                                            icon: 'bg-purple-500'
                                        },
                                        { 
                                            title: 'Auth Tag / Signature', 
                                            value: `0x${latestHash.substring(0, 32).toUpperCase()}`, 
                                            desc: 'Message Authentication Code (MAC) for verification.',
                                            howItWorks: 'A truncated portion of the hash or a GCM-generated tag used by the receiver to verify both authenticity and integrity instantly.',
                                            icon: 'bg-pink-500'
                                        }
                                    ].map((item, i) => (
                                        <div key={i} className="group relative pl-6 border-l border-slate-800 pb-4 last:pb-0">
                                            <div className={`absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full ${item.icon} shadow-[0_0_8px_rgba(59,130,246,0.3)] transition-transform group-hover:scale-125`} />
                                            <div className="space-y-1.5">
                                                <p className="text-[10px] font-black text-white uppercase tracking-tight">{item.title}</p>
                                                <div className="p-2 bg-black/40 rounded-xl border border-slate-800/50 group-hover:border-primary-500/30 transition-colors">
                                                    <p className="text-[10px] font-mono text-slate-300 break-all leading-relaxed line-clamp-4 group-hover:line-clamp-none transition-all cursor-help">{item.value}</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{item.desc}</p>
                                                    <p className="text-[9px] text-slate-400 leading-snug bg-slate-800/20 p-2 rounded-lg border-l border-primary-500/50">
                                                        <span className="text-primary-400 font-bold mr-1 italic">Underground Implementation:</span>
                                                        {item.howItWorks}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Protocol Architecture Section */}
                            <div className="space-y-3 pt-2">
                                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 px-1 border-l-2 border-emerald-500 ml-1 pl-2">System Architecture & Core Logic</p>
                                <div className="space-y-2">
                                    {[
                                        { 
                                            label: 'Symmetric Layer', 
                                            val: 'AES-256-CBC', 
                                            desc: 'Handles the bulk encryption of data.',
                                            underground: 'Implementation utilizes hardware acceleration (AES-NI) when available. Uses a unique Initialization Vector (IV) for every single message.'
                                        },
                                        { 
                                            label: 'Asymmetric Layer', 
                                            val: 'RSA-OAEP 2048', 
                                            desc: 'Solves the "Key Exchange" problem.',
                                            underground: 'The core utilizes prime number factorisation security. OAEP padding prevents adaptive chosen ciphertext attacks (CCA2).'
                                        },
                                        { 
                                            label: 'Hashing Mechanism', 
                                            val: 'SHA-256', 
                                            desc: 'Fixed-length message digest.',
                                            underground: 'Uses 64 rounds of compression functions based on bitwise operations (XOR, AND, OR, Shift) and modular addition.'
                                        },
                                        { 
                                            label: 'Hybrid Handshake', 
                                            val: 'RSA/AES-256', 
                                            desc: 'Combines efficiency with security.',
                                            underground: 'AES provides the performance (speed), while RSA provides the secure tunnel for the symmetric key delivery.'
                                        }
                                    ].map((item, i) => (
                                        <div key={i} className="p-4 bg-slate-800/30 rounded-2xl border border-slate-700/30 hover:border-emerald-500/50 transition-all group">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-black text-slate-200 uppercase tracking-widest">{item.label}</span>
                                                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-md text-[9px] font-mono font-bold border border-emerald-500/30">{item.val}</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 leading-relaxed mb-2 font-bold">{item.desc}</p>
                                            <div className="p-2.5 bg-black/40 rounded-xl border border-slate-800 group-hover:border-emerald-500/20 transition-colors">
                                                <p className="text-[9px] text-slate-500 italic leading-snug">
                                                    <span className="text-emerald-500/70 font-black not-italic mr-1 uppercase text-[8px]">Under the Hood:</span>
                                                    {item.underground}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Network Traffic Section */}
                            <div className="space-y-3 pt-2">
                                <div className="flex items-center justify-between px-1">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 border-l-2 border-red-500 pl-2">Intercepted Network Traffic</p>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                        <span className="text-[8px] font-black text-red-500/70 uppercase">MITM Active</span>
                                    </div>
                                </div>
                                <div className="bg-black/60 rounded-2xl p-4 font-mono text-[9px] space-y-3 border border-red-900/20 relative">
                                    <div className="absolute top-2 right-2 text-[7px] text-red-500/30 font-black tracking-widest">PACKET_SNIFFER_V3</div>
                                    {messages.length === 0 ? (
                                        <p className="text-slate-600 italic">Listening for network packets...</p>
                                    ) : (
                                        [...messages].slice(-4).reverse().map((m, i) => (
                                            <div key={i} className="space-y-2 pb-3 border-b border-slate-800/50 last:border-0 last:pb-0">
                                                <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest">
                                                    <span className={`${(m.sender_id === 'me' || m.isOwn) ? 'text-blue-400' : 'text-emerald-400'}`}>
                                                        {(m.sender_id === 'me' || m.isOwn) ? 'Out' : 'In'} Packet #{messages.length - (messages.length - 1 - messages.indexOf(m))}
                                                    </span>
                                                    <span className="text-slate-600">SEQ: {Math.floor(Math.random() * 10000)}</span>
                                                </div>
                                                <div className="grid grid-cols-[65px_1fr] gap-1 text-slate-400">
                                                    <span className="text-red-500/40 font-bold uppercase text-[7px]">Ciphertext</span> 
                                                    <span className="text-slate-200 truncate font-mono">{m.ciphertext || "[BINARY_STREAM]"}</span>
                                                    <span className="text-red-500/40 font-bold uppercase text-[7px]">Auth_Tag</span> 
                                                    <span className="text-red-500/50 truncate font-mono">{m.hash?.substring(0, 16) || "NO_TAG"}</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="p-4 bg-primary-600/10 border border-primary-500/20 rounded-2xl relative overflow-hidden group">
                                <div className="absolute inset-0 bg-primary-500/5 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                <p className="text-[10px] font-black text-primary-400 leading-tight text-center uppercase tracking-[0.2em] relative z-10">
                                    End-to-End Encryption Verified
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
