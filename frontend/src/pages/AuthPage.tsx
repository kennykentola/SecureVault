import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { KeyManager } from '../crypto/keyManager';
import { databases, APPWRITE_CONFIG, account } from '../lib/appwrite';
import { Lock, Mail, User, ShieldCheck, ArrowRight, Loader2, Fingerprint, ShieldAlert, Sparkles, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ID, Query } from 'appwrite';
import { PinInput } from '../components/PinInput';

export const AuthPage: React.FC = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [authMethod, setAuthMethod] = useState<'email' | 'phone' | 'google'>('email');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [username, setUsername] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const { loginEmail, loginGoogle } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        if (e) e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (isLogin) {
                if (authMethod === 'email') {
                    await loginEmail(email, password);
                } else if (authMethod === 'google') {
                    await loginGoogle();
                }
            } else {
                if (pin.length < 6) throw new Error("Please complete the 6-digit security PIN.");

                let activeId: string;
                try {
                    const newId = ID.unique();
                    await account.create(newId, email, password, username);
                    activeId = newId;
                } catch (e: any) {
                    if (e.code === 409) {
                        try {
                            await loginEmail(email, password);
                            const activeUser = await account.get();
                            activeId = activeUser.$id;
                        } catch (err: any) {
                            throw new Error("Account exists, but login failed. Please check credentials.");
                        }
                    } else {
                        throw e;
                    }
                }

                const keys = await KeyManager.generateKeyPair();
                await KeyManager.storePrivateKey(keys.privateKey, keys.publicKey, pin);
                const publicKeyStr = await KeyManager.exportPublicKey(keys.publicKey);
                const vaultBackup = JSON.stringify(
                    await KeyManager.createVaultBackupRecord(keys.privateKey, publicKeyStr, pin)
                );
                
                const generatedRecoveryKey = KeyManager.generateRecoveryKey();
                const recoveryVaultBackup = JSON.stringify(
                    await KeyManager.createRecoveryVaultBackupRecord(keys.privateKey, generatedRecoveryKey, publicKeyStr)
                );

                sessionStorage.setItem('new_recovery_key', generatedRecoveryKey);

                const profilePayload = {
                    user_id: activeId,
                    username: username,
                    email: email,
                    phone: phone,
                    public_key: publicKeyStr,
                    vault_backup: vaultBackup,
                    recovery_vault_backup: recoveryVaultBackup,
                    legacy_vault_backups: "[]",
                    role: 'user',
                    status: 'active'
                };
                const recoveryProfilePayload = {
                    ...profilePayload,
                    recovery_vault_backup: recoveryVaultBackup
                };
                const fallbackProfilePayload = {
                    user_id: activeId,
                    username: username,
                    email: email,
                    phone: phone,
                    public_key: publicKeyStr,
                    role: 'user',
                    status: 'active'
                };

                // Ensure logged in to write metadata
                try { await account.get(); } catch { await loginEmail(email, password); }

                // CLEANUP DUPLICATES: Check if any other records exist for this email
                try {
                    const existingDocs = await databases.listDocuments(
                        APPWRITE_CONFIG.DATABASE_ID,
                        APPWRITE_CONFIG.COLLECTION_USERS,
                        [Query.equal("email", email)]
                    );

                    // Delete any old documents that don't match our current activeId
                    for (const doc of existingDocs.documents) {
                        if (doc.$id !== activeId) {
                            console.log("Cleaning up duplicate profile:", doc.$id);
                            await databases.deleteDocument(
                                APPWRITE_CONFIG.DATABASE_ID,
                                APPWRITE_CONFIG.COLLECTION_USERS,
                                doc.$id
                            ).catch(() => {}); // Ignore errors on delete
                        }
                    }
                } catch (e) {
                    console.error("Cleanup check failed:", e);
                }

                try {
                    await databases.createDocument(
                        APPWRITE_CONFIG.DATABASE_ID,
                        APPWRITE_CONFIG.COLLECTION_USERS,
                        activeId,
                        recoveryProfilePayload
                    );
                } catch (e: any) {
                    if (e.code === 409) {
                        console.log("Metadata already exists, updating keys...");
                        try {
                            await databases.updateDocument(
                                APPWRITE_CONFIG.DATABASE_ID,
                                APPWRITE_CONFIG.COLLECTION_USERS,
                                activeId,
                                { 
                                    public_key: publicKeyStr,
                                    vault_backup: vaultBackup,
                                    recovery_vault_backup: recoveryVaultBackup,
                                    username: username,
                                    phone: phone
                                }
                            );
                        } catch (updateError: any) {
                            if (updateError?.message?.includes("vault_backup") || updateError?.message?.includes("legacy_vault_backups") || updateError?.message?.includes("recovery_vault_backup")) {
                                await databases.updateDocument(
                                    APPWRITE_CONFIG.DATABASE_ID,
                                    APPWRITE_CONFIG.COLLECTION_USERS,
                                    activeId,
                                    {
                                        public_key: publicKeyStr,
                                        username: username,
                                        phone: phone
                                    }
                                );
                            } else {
                                throw updateError;
                            }
                        }
                    } else if (e?.message?.includes("vault_backup") || e?.message?.includes("legacy_vault_backups") || e?.message?.includes("recovery_vault_backup") || e?.message?.includes("Unknown attribute")) {
                        await databases.createDocument(
                            APPWRITE_CONFIG.DATABASE_ID,
                            APPWRITE_CONFIG.COLLECTION_USERS,
                            activeId,
                            fallbackProfilePayload
                        );
                    } else {
                        throw new Error("Account created but profile sync failed. Please try logging in.");
                    }
                }
            }

        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <div className="min-h-screen flex items-center justify-center p-6 font-sans overflow-hidden bg-gray-50">

            {/* Background Blobs */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/5 blur-[150px] -z-10 rounded-full" />
            
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-lg bg-white rounded-[3rem] p-12 space-y-10 shadow-xl border border-gray-200"
            >
                <div className="text-center space-y-4">
                    <div className="inline-flex p-4 bg-primary-600/20 rounded-3xl border border-primary-500/20 shadow-2xl shadow-primary-500/10 animate-float">

                        <ShieldCheck className="w-10 h-10 text-primary-400" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black tracking-tighter uppercase text-gray-900">Sign In</h1>
                        <p className="text-gray-500 text-[10px] uppercase tracking-[0.4em] font-bold mt-2">End-to-End Encrypted Messaging</p>
                    </div>
                </div>

                <div className="flex p-2 bg-gray-100 rounded-2xl border border-gray-200">
                    <button
                        onClick={() => setIsLogin(true)}
                        className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${isLogin ? 'bg-blue-500 text-white shadow-lg' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Sign In
                    </button>
                    <button
                        onClick={() => setIsLogin(false)}
                        className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${!isLogin ? 'bg-blue-500 text-white shadow-lg' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Sign Up
                    </button>
                </div>

                {isLogin && (
                    <div className="flex p-1 bg-gray-100 rounded-xl border border-gray-200">
                        <button
                            onClick={() => setAuthMethod('email')}
                            className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${authMethod === 'email' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Email
                        </button>
                        <button
                            onClick={() => setAuthMethod('google')}
                            className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${authMethod === 'google' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Google
                        </button>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-8">
                    <AnimatePresence mode='wait'>
                        {!isLogin && (
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="space-y-6"
                            >
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Username</label>
                                    <div className="flex items-center px-6 py-4 bg-gray-50 rounded-3xl border border-gray-200 focus-within:border-blue-500 focus-within:bg-white transition-all shadow-sm">
                                        <User className="w-5 h-5 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Choose a username"
                                            className="bg-transparent border-none outline-none text-sm text-gray-700 w-full ml-4"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="flex items-center px-6 py-4 bg-gray-50 rounded-3xl border border-gray-200 focus-within:border-blue-500 focus-within:bg-white transition-all shadow-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-phone w-5 h-5 text-gray-400"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.88 12.88 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                        <input
                                            type="tel"
                                            placeholder="Phone Number (e.g. +123...)"
                                            className="bg-transparent border-none outline-none text-sm text-gray-700 w-full ml-4"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {(isLogin && authMethod === 'email') || !isLogin ? (
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Email</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-primary-400 transition-colors" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-300 rounded-2xl py-4 pl-12 pr-6 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm text-gray-900 placeholder:text-gray-500"
                                    placeholder="your@email.com"
                                    required={(isLogin && authMethod === 'email') || !isLogin}
                                />
                            </div>
                        </div>
                    ) : null}


                    {((isLogin && authMethod === 'email') || !isLogin) ? (
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Password</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-300 rounded-2xl py-4 pl-12 pr-12 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm text-gray-900 placeholder:text-gray-500"
                                    placeholder="••••••••"
                                    required={(isLogin && authMethod === 'email') || !isLogin}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    ) : null}

                    {isLogin && authMethod === 'google' ? (
                        <div className="space-y-4">
                            <p className="text-center text-[10px] text-slate-500 uppercase tracking-widest">Continue with Google</p>
                            <button
                                type="submit"
                                className="w-full h-12 bg-red-500 hover:bg-red-400 text-white font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                </svg>
                                Sign In with Google
                            </button>
                        </div>
                    ) : null}

                    {!isLogin && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="space-y-6 pt-4"
                        >
                            <div className="flex items-center justify-between px-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-primary-400">PIN Code</label>
                                <Sparkles className="w-4 h-4 text-yellow-500 animate-pulse" />
                            </div>

                            <PinInput variant="embedded" onComplete={(p) => setPin(p)} onChange={(p) => setPin(p)} />

                            <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-2xl border border-orange-200 mb-4">
                                <ShieldAlert className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                                <p className="text-[9px] font-bold uppercase tracking-widest text-orange-600 leading-relaxed">
                                    Important: This 6-digit PIN secures your encryption keys locally. Keep it safe as it's not recoverable.
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {error && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="p-4 bg-red-50 border border-red-200 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-2xl flex items-center gap-3"
                        >
                            <Fingerprint className="w-4 h-4" />
                            {error}
                        </motion.div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-16 bg-blue-500 hover:bg-blue-400 active:scale-[0.98] disabled:opacity-50 text-white font-black uppercase tracking-[0.3em] rounded-2xl flex items-center justify-center gap-4 group transition-all shadow-lg hover:shadow-xl"
                    >
                        {isLoading ? (
                            <Loader2 className="w-6 h-6 animate-spin text-white" />
                        ) : (
                            <>
                                {isLogin ? (authMethod === 'google' ? 'Sign In with Google' : 'Sign In') : 'Sign Up'}
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform" />
                            </>
                        )}
                    </button>
                </form>
            </motion.div>
            
        </div>
    );
};
