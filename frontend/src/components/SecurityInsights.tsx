import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Zap, Globe, Activity, Eye, Lock, Hash, KeyRound, FileText, ChevronDown } from 'lucide-react';

interface SecurityInsightsProps {
    messages: any[];
}

type ProtocolItem = 'plaintext' | 'aes' | 'rsa' | 'sha' | 'auth';
type ArchItem = 'symmetric' | 'asymmetric' | 'hashing' | 'hybrid';

interface ItemDetail {
    title: string;
    value: string;
    desc: string;
    howItWorks: string;
    liveLabel: string;
    liveValue: string;
    liveHint: string;
    color: string;
    Icon: React.ElementType;
}

export const SecurityInsights: React.FC<SecurityInsightsProps> = ({ messages }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'metrics' | 'mitm' | 'protocol'>('metrics');
    const [networkLatency, setNetworkLatency] = useState<number>(0);
    const [selectedProtocol, setSelectedProtocol] = useState<ProtocolItem>('aes');
    const [selectedArch, setSelectedArch] = useState<ArchItem>('symmetric');

    useEffect(() => {
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
    const latestIV = latestTextMessage?.iv || 'N/A';

    const protocolItems: { key: ProtocolItem; label: string }[] = [
        { key: 'plaintext', label: 'Plaintext' },
        { key: 'aes', label: 'AES-256-CBC' },
        { key: 'rsa', label: 'RSA-OAEP 2048' },
        { key: 'sha', label: 'SHA-256' },
        { key: 'auth', label: 'Auth Tag' },
    ];

    const archItems: { key: ArchItem; label: string }[] = [
        { key: 'symmetric', label: 'Symmetric Layer' },
        { key: 'asymmetric', label: 'Asymmetric Layer' },
        { key: 'hashing', label: 'Hashing Mechanism' },
        { key: 'hybrid', label: 'Hybrid Handshake' },
    ];

    const protocolDetails: Record<ProtocolItem, ItemDetail> = {
        plaintext: {
            title: 'Plaintext Message',
            value: latestPlaintext,
            desc: 'Raw UTF-8 input string before buffer conversion.',
            howItWorks: 'The unencrypted data is encoded into a byte array, serving as the base for the encryption rounds.',
            liveLabel: 'Live Plaintext',
            liveValue: latestPlaintext,
            liveHint: 'This is the original message before any encryption is applied. It only exists in plain form on the sender\'s device.',
            color: 'bg-slate-500',
            Icon: FileText,
        },
        aes: {
            title: 'AES-256-CBC Ciphertext',
            value: latestCiphertext,
            desc: 'Advanced Encryption Standard with Cipher Block Chaining.',
            howItWorks: 'Uses a 256-bit key to encrypt data in 128-bit blocks. Each block is XORed with the previous ciphertext block to eliminate patterns.',
            liveLabel: 'Live Ciphertext',
            liveValue: latestCiphertext !== 'N/A' ? String(latestCiphertext) : 'No messages yet',
            liveHint: 'Each message gets a fresh random IV — no two ciphertexts are ever identical for the same plaintext.',
            color: 'bg-emerald-500',
            Icon: Lock,
        },
        rsa: {
            title: 'RSA-OAEP 2048 (Wrapped Key)',
            value: latestEncryptedKey,
            desc: 'Asymmetric Key Wrapping for secure transmission.',
            howItWorks: 'The AES session key is encrypted using the recipient\'s RSA public key. OAEP padding adds unique randomness to every encryption.',
            liveLabel: 'Live Wrapped Key',
            liveValue: latestEncryptedKey !== 'N/A' ? String(latestEncryptedKey) : 'No messages yet',
            liveHint: 'Only the recipient\'s private key can unwrap this. The server stores this blob but cannot read it.',
            color: 'bg-blue-500',
            Icon: KeyRound,
        },
        sha: {
            title: 'SHA-256 Integrity Hash',
            value: latestHash,
            desc: 'Cryptographic digest for tamper detection.',
            howItWorks: 'Processes the entire payload through a one-way hashing algorithm. Even a 1-bit change in data results in a completely different 256-bit hash.',
            liveLabel: 'Live Integrity Hash',
            liveValue: latestHash !== 'N/A' ? String(latestHash) : 'No messages yet',
            liveHint: 'If even one bit of the ciphertext changes in transit, this hash will not match on arrival.',
            color: 'bg-purple-500',
            Icon: Hash,
        },
        auth: {
            title: 'Auth Tag / Signature',
            value: `0x${latestHash.substring(0, 32).toUpperCase()}`,
            desc: 'Message Authentication Code (MAC) for verification.',
            howItWorks: 'A truncated portion of the hash or a GCM-generated tag used by the receiver to verify both authenticity and integrity instantly.',
            liveLabel: 'Live Auth Tag',
            liveValue: latestHash !== 'N/A' ? `0x${latestHash.substring(0, 32).toUpperCase()}` : 'N/A',
            liveHint: 'The receiver recomputes this tag and compares it. A mismatch means the message was tampered with.',
            color: 'bg-pink-500',
            Icon: Shield,
        },
    };

    const archDetails: Record<ArchItem, ItemDetail> = {
        symmetric: {
            title: 'Symmetric Layer',
            value: 'AES-256-CBC',
            desc: 'Handles the bulk encryption of data.',
            howItWorks: 'Implementation utilizes hardware acceleration (AES-NI) when available. Uses a unique Initialization Vector (IV) for every single message.',
            liveLabel: 'Live Ciphertext',
            liveValue: latestCiphertext !== 'N/A' ? String(latestCiphertext) : 'No messages yet',
            liveHint: 'Each message gets a fresh random IV — no two ciphertexts are ever identical for the same plaintext.',
            color: 'bg-emerald-500',
            Icon: Lock,
        },
        asymmetric: {
            title: 'Asymmetric Layer',
            value: 'RSA-OAEP 2048',
            desc: 'Solves the "Key Exchange" problem.',
            howItWorks: 'The core utilizes prime number factorisation security. OAEP padding prevents adaptive chosen ciphertext attacks (CCA2).',
            liveLabel: 'Live Wrapped Key',
            liveValue: latestEncryptedKey !== 'N/A' ? String(latestEncryptedKey) : 'No messages yet',
            liveHint: 'Only the recipient\'s private key can unwrap this. The server stores this blob but cannot read it.',
            color: 'bg-blue-500',
            Icon: KeyRound,
        },
        hashing: {
            title: 'Hashing Mechanism',
            value: 'SHA-256',
            desc: 'Fixed-length message digest.',
            howItWorks: 'Uses 64 rounds of compression functions based on bitwise operations (XOR, AND, OR, Shift) and modular addition.',
            liveLabel: 'Live Integrity Hash',
            liveValue: latestHash !== 'N/A' ? String(latestHash) : 'No messages yet',
            liveHint: 'If even one bit of the ciphertext changes in transit, this hash will not match on arrival.',
            color: 'bg-purple-500',
            Icon: Hash,
        },
        hybrid: {
            title: 'Hybrid Handshake',
            value: 'RSA/AES-256',
            desc: 'Combines efficiency with security.',
            howItWorks: 'AES provides the performance (speed), while RSA provides the secure tunnel for the symmetric key delivery.',
            liveLabel: 'Live IV + Key Size',
            liveValue: latestIV !== 'N/A' ? `IV: ${String(latestIV).substring(0, 20)}…` : 'No messages yet',
            liveHint: 'AES-256 needs a 256-bit key + 128-bit IV. RSA-2048 wraps the key. Together they form the hybrid handshake.',
            color: 'bg-orange-500',
            Icon: FileText,
        },
    };

    const activeProtocol = protocolDetails[selectedProtocol];
    const activeArch = archDetails[selectedArch];

    return (
        <div className="fixed bottom-28 md:bottom-6 right-6 z-[100]">
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(!isOpen)}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-colors ${isOpen ? 'bg-primary-600 text-white' : 'bg-white text-primary-600 border border-primary-500/30'
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
                        {/* ── Header ── */}
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

                        {/* ── Tab Switcher ── */}
                        <div className="px-4 pt-3 pb-0 flex gap-1 bg-slate-800/30">
                            <button
                                onClick={() => setActiveTab('metrics')}
                                className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-t-xl transition-all ${activeTab === 'metrics'
                                    ? 'bg-slate-700/80 text-white border-b-2 border-white'
                                    : 'text-slate-400 hover:text-slate-200'
                                    }`}
                            >
                                Metrics
                            </button>
                            <button
                                onClick={() => setActiveTab('protocol')}
                                className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-t-xl transition-all ${activeTab === 'protocol'
                                    ? 'bg-slate-700/80 text-white border-b-2 border-white'
                                    : 'text-slate-400 hover:text-slate-200'
                                    }`}
                            >
                                Protocol
                            </button>
                            <button
                                onClick={() => setActiveTab('mitm')}
                                className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-t-xl transition-all ${activeTab === 'mitm'
                                    ? 'bg-slate-700/80 text-white border-b-2 border-white'
                                    : 'text-slate-400 hover:text-slate-200'
                                    }`}
                            >
                                MITM
                            </button>
                        </div>

                        {/* ── Tab Content ── */}
                        <div className="p-5 max-h-[60vh] md:max-h-[70vh] overflow-y-auto custom-scrollbar space-y-6">
                            {activeTab === 'metrics' ? (
                                <div className="space-y-4">
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

                                    <div className="space-y-2">
                                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 px-1">Active Protocols</p>
                                        <div className="space-y-1.5">
                                            {[
                                                { label: 'Symmetric', val: 'AES-256-CBC', color: 'bg-green-500', icon: Lock, live: latestCiphertext !== 'N/A' ? `Cipher: ${String(latestCiphertext).substring(0, 24)}…` : 'No messages yet' },
                                                { label: 'Asymmetric', val: 'RSA-OAEP 2048', color: 'bg-blue-500', icon: KeyRound, live: latestEncryptedKey !== 'N/A' ? `Key: ${String(latestEncryptedKey).substring(0, 24)}…` : 'No messages yet' },
                                                { label: 'Hashing', val: 'SHA-256', color: 'bg-purple-500', icon: Hash, live: latestHash !== 'N/A' ? `Hash: ${String(latestHash).substring(0, 24)}…` : 'No messages yet' },
                                                { label: 'Key Exchange', val: 'Hybrid RSA/AES', color: 'bg-orange-500', icon: FileText, live: latestIV !== 'N/A' ? `IV: ${String(latestIV).substring(0, 24)}…` : 'No messages yet' }
                                            ].map((item, i) => (
                                                <div key={i} className="p-2.5 bg-slate-800/30 rounded-xl border border-slate-700/30 hover:border-slate-600/50 transition-all group">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
                                                            <span className="text-[10px] font-bold text-slate-300">{item.label}</span>
                                                        </div>
                                                        <span className="text-[9px] font-mono text-slate-500">{item.val}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <item.icon className="w-2.5 h-2.5 text-slate-600 shrink-0" />
                                                        <span className="text-[8px] font-mono text-slate-500 truncate">{item.live}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : activeTab === 'protocol' ? (
                                <div className="space-y-4">
                                    {/* ── Pipeline Button Row ── */}
                                    <div className="space-y-2">
                                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 px-1">Data Transformation Pipeline</p>
                                        <div className="flex flex-wrap gap-1">
                                            {protocolItems.map((item) => {
                                                const detail = protocolDetails[item.key];
                                                const isActive = selectedProtocol === item.key;
                                                return (
                                                    <button
                                                        key={item.key}
                                                        onClick={() => setSelectedProtocol(item.key)}
                                                        className={`px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest rounded-t-xl transition-all flex items-center gap-1 ${isActive
                                                            ? 'bg-slate-700/80 text-white border-b-2 border-white'
                                                            : 'text-slate-400 hover:text-slate-200'
                                                            }`}
                                                    >
                                                        <detail.Icon className="w-2.5 h-2.5" />
                                                        {item.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* ── Selected Pipeline Detail ── */}
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={selectedProtocol}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -8 }}
                                            transition={{ duration: 0.2 }}
                                            className="relative pl-6 border-l border-slate-800 space-y-2"
                                        >
                                            <div className={`absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full ${activeProtocol.color} shadow-[0_0_8px_rgba(59,130,246,0.3)]`} />
                                            <div className="flex items-center gap-2">
                                                <activeProtocol.Icon className="w-3 h-3 text-slate-500" />
                                                <p className="text-[10px] font-black text-white uppercase tracking-tight">{activeProtocol.title}</p>
                                            </div>
                                            <div className="p-2 bg-black/40 rounded-xl border border-slate-800/50">
                                                <p className="text-[10px] font-mono text-slate-300 break-all leading-relaxed cursor-help">{activeProtocol.value}</p>
                                            </div>
                                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{activeProtocol.desc}</p>
                                            <p className="text-[9px] text-slate-400 leading-snug bg-slate-800/20 p-2 rounded-lg border-l border-primary-500/50">
                                                <span className="text-primary-400 font-bold mr-1 italic">Underground Implementation:</span>
                                                {activeProtocol.howItWorks}
                                            </p>
                                            <p className="text-[8px] text-slate-600 italic leading-snug">
                                                💡 {activeProtocol.liveHint}
                                            </p>
                                        </motion.div>
                                    </AnimatePresence>

                                    {/* ── Architecture Button Row ── */}
                                    <div className="space-y-2 pt-2">
                                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 px-1 border-l-2 border-emerald-500 ml-1 pl-2">System Architecture & Core Logic</p>
                                        <div className="flex flex-wrap gap-1">
                                            {archItems.map((item) => {
                                                const detail = archDetails[item.key];
                                                const isActive = selectedArch === item.key;
                                                return (
                                                    <button
                                                        key={item.key}
                                                        onClick={() => setSelectedArch(item.key)}
                                                        className={`px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest rounded-t-xl transition-all flex items-center gap-1 ${isActive
                                                            ? 'bg-slate-700/80 text-white border-b-2 border-white'
                                                            : 'text-slate-400 hover:text-slate-200'
                                                            }`}
                                                    >
                                                        <detail.Icon className="w-2.5 h-2.5" />
                                                        {item.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* ── Selected Architecture Detail ── */}
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={selectedArch}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -8 }}
                                            transition={{ duration: 0.2 }}
                                            className="p-4 bg-slate-800/30 rounded-2xl border border-slate-700/30"
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <activeArch.Icon className="w-3 h-3 text-emerald-500/60" />
                                                    <span className="text-[10px] font-black text-slate-200 uppercase tracking-widest">{activeArch.title}</span>
                                                </div>
                                                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-md text-[9px] font-mono font-bold border border-emerald-500/30">{activeArch.value}</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 leading-relaxed mb-2 font-bold">{activeArch.desc}</p>
                                            <div className="p-2.5 bg-black/40 rounded-xl border border-slate-800 mb-2">
                                                <p className="text-[8px] font-black uppercase tracking-widest text-emerald-500/60 mb-1">{activeArch.liveLabel}</p>
                                                <p className="text-[9px] font-mono text-slate-300 break-all leading-relaxed cursor-help">{activeArch.liveValue}</p>
                                            </div>
                                            <div className="p-2.5 bg-black/40 rounded-xl border border-slate-800">
                                                <p className="text-[9px] text-slate-500 italic leading-snug">
                                                    <span className="text-emerald-500/70 font-black not-italic mr-1 uppercase text-[8px]">Under the Hood:</span>
                                                    {activeArch.howItWorks}
                                                </p>
                                            </div>
                                            <p className="text-[8px] text-slate-600 mt-1.5 italic leading-snug">
                                                💡 {activeArch.liveHint}
                                            </p>
                                        </motion.div>
                                    </AnimatePresence>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl">
                                        <Eye className="w-4 h-4 text-red-500 shrink-0" />
                                        <p className="text-[10px] leading-tight text-red-200">
                                            Intercepted database records (Ciphertexts) captured from the network stream.
                                        </p>
                                    </div>

                                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-400 mb-1">⚠️ Why This Matters</p>
                                        <p className="text-[9px] text-slate-400 leading-snug">
                                            Even though an attacker can see this encrypted traffic, they <span className="text-amber-300 font-bold">cannot read the message</span> without your private key. The ciphertext is mathematically irreversible without the decryption key that never leaves your device. This is the core guarantee of End-to-End Encryption.
                                        </p>
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
