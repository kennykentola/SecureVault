import React, { createContext, useContext, useEffect, useState } from 'react';
import { account } from '../lib/appwrite';
import { KeyManager } from '../crypto/keyManager';



interface AuthContextType {
    user: any | null;
    loading: boolean;
    privateKey: CryptoKey | null;
    loginEmail: (email: string, pass: string) => Promise<void>;
    loginPhone: (userId: string, secret: string) => Promise<void>;
    loginGoogle: () => Promise<void>;
    sendPhoneOTP: (phone: string) => Promise<void>;
    logout: () => Promise<void>;
    unlockKeys: (pin: string) => Promise<void>;
    resetKeys: () => Promise<void>;
    checkKeys: () => Promise<boolean>;
    setupNewVault: (pin: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);

    useEffect(() => {
        console.log("AuthProvider Initialized. Checking session...");
        checkSession().then(() => restoreKeyFromSession());
    }, []);

    const restoreKeyFromSession = async () => {
        const storedKey = sessionStorage.getItem('unlocked_vault');
        if (storedKey) {
            try {
                const jwk = JSON.parse(storedKey);
                const importedKey = await window.crypto.subtle.importKey(
                    "jwk",
                    jwk,
                    { name: "RSA-OAEP", hash: "SHA-256" },
                    true,
                    ["decrypt"]
                );
                setPrivateKey(importedKey);
                console.log("Restored encryption keys from session.");
            } catch (e) {
                console.error("Failed to restore session keys", e);
                sessionStorage.removeItem('unlocked_vault');
            }
        }
    };


    const checkSession = async () => {
        try {
            if (!account) {
                console.error("Appwrite Account service not initialized!");
                return;
            }
            const session = await account.get();
            setUser(session);
            console.log("User session found:", session.$id);
        } catch (e: any) {
            const statusCode = e?.code ?? e?.response?.code;
            if (statusCode === 401) {
                console.log("No active Appwrite session found.");
            } else {
                console.warn("Session check failed:", e);
            }
            setUser(null);
        } finally {
            setLoading(false);
        }
    };


    const loginEmail = async (email: string, pass: string) => {
        await account.createEmailPasswordSession(email, pass);
        await checkSession();
    };

    const sendPhoneOTP = async (phone: string) => {
        await account.createPhoneToken(phone, 'sms');
    };

    const loginPhone = async (userId: string, secret: string) => {
        await account.createSession(userId, secret);
        await checkSession();
    };

    const loginGoogle = async () => {
        await account.createOAuth2Session('google' as any, window.location.origin, window.location.origin + '/auth');
    };

    const logout = async () => {
        await account.deleteSession('current');
        setUser(null);
        setPrivateKey(null);
        sessionStorage.removeItem('unlocked_vault');
    };

    const checkKeys = async (): Promise<boolean> => {
        // Just check if key exists in IDB
        try {
            const request = indexedDB.open('E2EEMessagingDB', 2); // Standardized to version 2
            return new Promise((resolve) => {
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains('KeysStore')) {
                        db.createObjectStore('KeysStore');
                    }
                };
                request.onsuccess = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains('KeysStore')) {
                        resolve(false);
                        return;
                    }
                    const tx = db.transaction('KeysStore', 'readonly');
                    const req = tx.objectStore('KeysStore').get('privateKey');
                    req.onsuccess = () => resolve(!!req.result);
                    req.onerror = () => resolve(false);
                };
                request.onerror = () => resolve(false);
            });
        } catch { return false; }
    };

    const unlockKeys = async (pin: string) => {
        try {
            const key = await KeyManager.getPrivateKey(pin);
            if (key) {
                setPrivateKey(key);
                // Persist for this tab only
                const jwk = await window.crypto.subtle.exportKey("jwk", key);
                sessionStorage.setItem('unlocked_vault', JSON.stringify(jwk));
                console.log("Vault successfully unlocked.");
            } else {
                throw new Error("No security keys found on this device.");
            }
        } catch (e: any) {
            console.error("Unlock failed", e);
            if (e.message.includes("No security keys found")) {
                alert("No security keys were found on this device.\n\nPossible reasons:\n1. You registered on a different address (like 127.0.0.1 vs localhost).\n2. You are using a different browser.\n3. Your browser data was cleared.\n\nPlease try using the same address you registered with, or re-register if this is a new device.");
            } else {
                alert(e.message || "Failed to unlock vault. Please check your PIN.");
            }
            throw e;
        }
    };
    
    const resetKeys = async () => {
        if (window.confirm("WARNING: This will permanently delete your encryption keys on this device. You will NOT be able to read old messages. Proceed?")) {
            await KeyManager.resetAllKeys();
            setPrivateKey(null);
            sessionStorage.removeItem('unlocked_vault');
            window.location.reload();
        }
    };

    const setupNewVault = async (pin: string) => {
        try {
            console.log("Setting up new vault for user:", user?.$id);
            const keys = await KeyManager.generateKeyPair();
            await KeyManager.storePrivateKey(keys.privateKey, keys.publicKey, pin);
            const publicKeyStr = await KeyManager.exportPublicKey(keys.publicKey);

            // Fetch metadata doc
            const { databases, APPWRITE_CONFIG } = await import('../lib/appwrite');
            const { Query } = await import('appwrite');
            
            const res = await databases.listDocuments(
                APPWRITE_CONFIG.DATABASE_ID,
                APPWRITE_CONFIG.COLLECTION_USERS,
                [Query.equal("user_id", user?.$id)]
            );

            if (res.total > 0) {
                await databases.updateDocument(
                    APPWRITE_CONFIG.DATABASE_ID,
                    APPWRITE_CONFIG.COLLECTION_USERS,
                    res.documents[0].$id,
                    { public_key: publicKeyStr }
                );
            }

            setPrivateKey(keys.privateKey);
            const jwk = await window.crypto.subtle.exportKey("jwk", keys.privateKey);
            sessionStorage.setItem('unlocked_vault', JSON.stringify(jwk));
            console.log("New vault initialized and synced.");
        } catch (e: any) {
            console.error("Setup failed", e);
            throw new Error(e.message || "Failed to initialize new vault.");
        }
    };


    return (
        <AuthContext.Provider value={{ user, loading, privateKey, loginEmail, loginPhone, loginGoogle, sendPhoneOTP, logout, unlockKeys, resetKeys, checkKeys, setupNewVault }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};
