import React, { createContext, useContext, useEffect, useState } from 'react';
import { account } from '../lib/appwrite';
import { KeyManager, type VaultBackupRecord } from '../crypto/keyManager';



interface AuthContextType {
    user: any | null;
    loading: boolean;
    privateKey: CryptoKey | null;
    legacyPrivateKeys: CryptoKey[];
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
    const [legacyPrivateKeys, setLegacyPrivateKeys] = useState<CryptoKey[]>([]);

    useEffect(() => {
        console.log("AuthProvider Initialized. Checking session...");
        checkSession().then(() => restoreKeyFromSession());
    }, []);

    const restoreKeyFromSession = async () => {
        const storedKey = sessionStorage.getItem('unlocked_vault');
        const storedLegacyKeys = sessionStorage.getItem('unlocked_legacy_vaults');
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
        if (storedLegacyKeys) {
            try {
                const jwks = JSON.parse(storedLegacyKeys);
                if (Array.isArray(jwks)) {
                    const importedKeys = await Promise.all(jwks.map((jwk) => (
                        window.crypto.subtle.importKey(
                            "jwk",
                            jwk,
                            { name: "RSA-OAEP", hash: "SHA-256" },
                            true,
                            ["decrypt"]
                        )
                    )));
                    setLegacyPrivateKeys(importedKeys);
                }
            } catch (e) {
                console.error("Failed to restore legacy vault keys from session", e);
                sessionStorage.removeItem('unlocked_legacy_vaults');
            }
        }
    };

    const persistLegacyKeysToSession = async (keys: CryptoKey[]) => {
        if (!keys.length) {
            sessionStorage.removeItem('unlocked_legacy_vaults');
            return;
        }

        const jwks = await Promise.all(keys.map((key) => window.crypto.subtle.exportKey("jwk", key)));
        sessionStorage.setItem('unlocked_legacy_vaults', JSON.stringify(jwks));
    };

    const getMyProfileDocument = async () => {
        if (!user?.$id) return null;

        const { databases, APPWRITE_CONFIG } = await import('../lib/appwrite');
        const { Query } = await import('appwrite');
        const res = await databases.listDocuments(
            APPWRITE_CONFIG.DATABASE_ID,
            APPWRITE_CONFIG.COLLECTION_USERS,
            [Query.equal("user_id", user.$id)]
        );

        return res.total > 0 ? { doc: res.documents[0], databases, APPWRITE_CONFIG } : null;
    };

    const normalizeBackupRecord = (raw: any): VaultBackupRecord | null => {
        if (!raw) return null;

        const parsed = typeof raw === 'string' ? (() => {
            try { return JSON.parse(raw); } catch { return null; }
        })() : raw;

        if (!parsed || typeof parsed !== 'object') return null;

        const publicKey = parsed.public_key || parsed.publicKey;
        const backup = parsed.backup;
        const createdAt = parsed.created_at || parsed.createdAt || new Date().toISOString();

        if (!publicKey || !backup) return null;

        return {
            public_key: publicKey,
            backup,
            created_at: createdAt
        };
    };

    const parseBackupHistory = (raw: any): VaultBackupRecord[] => {
        if (!raw) return [];

        const parsed = typeof raw === 'string' ? (() => {
            try { return JSON.parse(raw); } catch { return []; }
        })() : raw;

        if (!Array.isArray(parsed)) return [];

        return parsed
            .map(normalizeBackupRecord)
            .filter((record): record is VaultBackupRecord => !!record);
    };

    const syncCurrentVaultBackup = async (activePrivateKey: CryptoKey, pin: string, publicKey: string) => {
        try {
            const profile = await getMyProfileDocument();
            if (!profile) return;

            const currentRecord = normalizeBackupRecord(profile.doc.vault_backup);
            if (currentRecord?.public_key === publicKey) {
                return;
            }

            const backupRecord = await KeyManager.createVaultBackupRecord(activePrivateKey, publicKey, pin);
            await profile.databases.updateDocument(
                profile.APPWRITE_CONFIG.DATABASE_ID,
                profile.APPWRITE_CONFIG.COLLECTION_USERS,
                profile.doc.$id,
                { vault_backup: JSON.stringify(backupRecord) }
            );
        } catch (e) {
            console.warn("[Security] Failed to sync encrypted vault backup:", e);
        }
    };

    const archiveExistingVaultIfPresent = async (pin: string) => {
        try {
            const existingPublicKey = await KeyManager.getPublicKey();
            if (!existingPublicKey) return;

            const existingPrivateKey = await KeyManager.getPrivateKey(pin).catch(() => null);
            if (!existingPrivateKey) return;

            const profile = await getMyProfileDocument();
            if (!profile) return;

            const history = parseBackupHistory(profile.doc.legacy_vault_backups);
            if (history.some(record => record.public_key === existingPublicKey)) {
                return;
            }

            const backupRecord = await KeyManager.createVaultBackupRecord(existingPrivateKey, existingPublicKey, pin);
            const nextHistory = [backupRecord, ...history].slice(0, 5);

            await profile.databases.updateDocument(
                profile.APPWRITE_CONFIG.DATABASE_ID,
                profile.APPWRITE_CONFIG.COLLECTION_USERS,
                profile.doc.$id,
                { legacy_vault_backups: JSON.stringify(nextHistory) }
            );
        } catch (e) {
            console.warn("[Security] Failed to archive previous vault key:", e);
        }
    };

    const restorePrimaryVaultFromBackup = async (pin: string) => {
        const profile = await getMyProfileDocument();
        if (!profile) return null;

        const backupRecord = normalizeBackupRecord(profile.doc.vault_backup);
        if (!backupRecord) return null;

        const restoredPrivateKey = await KeyManager.restorePrivateKeyFromBackup(backupRecord.backup, pin);
        const restoredPublicKey = await KeyManager.importPublicKey(backupRecord.public_key);
        await KeyManager.storePrivateKey(restoredPrivateKey, restoredPublicKey, pin);
        return restoredPrivateKey;
    };

    const loadLegacyPrivateKeys = async (pin: string, currentPublicKey: string | null) => {
        try {
            const profile = await getMyProfileDocument();
            if (!profile) return [];

            const history = parseBackupHistory(profile.doc.legacy_vault_backups);
            const usableHistory = history.filter(record => record.public_key && record.public_key !== currentPublicKey);
            const loadedKeys: CryptoKey[] = [];

            for (const record of usableHistory) {
                try {
                    loadedKeys.push(await KeyManager.restorePrivateKeyFromBackup(record.backup, pin));
                } catch (e) {
                    console.warn("[Security] Failed to unlock a legacy vault backup:", e);
                }
            }

            return loadedKeys;
        } catch (e) {
            console.warn("[Security] Failed to load legacy vault backups:", e);
            return [];
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
        setLegacyPrivateKeys([]);
        sessionStorage.removeItem('unlocked_vault');
        sessionStorage.removeItem('unlocked_legacy_vaults');
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
            let key = await KeyManager.getPrivateKey(pin);
            if (!key) {
                key = await restorePrimaryVaultFromBackup(pin);
            }
            if (key) {
                setPrivateKey(key);
                // Persist for this tab only
                const jwk = await window.crypto.subtle.exportKey("jwk", key);
                sessionStorage.setItem('unlocked_vault', JSON.stringify(jwk));

                const currentPublicKey = await KeyManager.getPublicKey();
                if (currentPublicKey) {
                    await syncCurrentVaultBackup(key, pin, currentPublicKey);
                }

                const unlockedLegacyKeys = await loadLegacyPrivateKeys(pin, currentPublicKey);
                setLegacyPrivateKeys(unlockedLegacyKeys);
                await persistLegacyKeysToSession(unlockedLegacyKeys);
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
            setLegacyPrivateKeys([]);
            sessionStorage.removeItem('unlocked_vault');
            sessionStorage.removeItem('unlocked_legacy_vaults');
            window.location.reload();
        }
    };

    const setupNewVault = async (pin: string) => {
        try {
            console.log("Setting up new vault for user:", user?.$id);
            await archiveExistingVaultIfPresent(pin);
            const keys = await KeyManager.generateKeyPair();
            await KeyManager.storePrivateKey(keys.privateKey, keys.publicKey, pin);
            const publicKeyStr = await KeyManager.exportPublicKey(keys.publicKey);
            const backupRecord = await KeyManager.createVaultBackupRecord(keys.privateKey, publicKeyStr, pin);

            // Fetch metadata doc
            const { databases, APPWRITE_CONFIG } = await import('../lib/appwrite');
            const { Query } = await import('appwrite');
            
            const res = await databases.listDocuments(
                APPWRITE_CONFIG.DATABASE_ID,
                APPWRITE_CONFIG.COLLECTION_USERS,
                [Query.equal("user_id", user?.$id)]
            );

            if (res.total > 0) {
                try {
                    await databases.updateDocument(
                        APPWRITE_CONFIG.DATABASE_ID,
                        APPWRITE_CONFIG.COLLECTION_USERS,
                        res.documents[0].$id,
                        {
                            public_key: publicKeyStr,
                            vault_backup: JSON.stringify(backupRecord)
                        }
                    );
                } catch (updateError: any) {
                    if (updateError?.message?.includes("vault_backup")) {
                        await databases.updateDocument(
                            APPWRITE_CONFIG.DATABASE_ID,
                            APPWRITE_CONFIG.COLLECTION_USERS,
                            res.documents[0].$id,
                            { public_key: publicKeyStr }
                        );
                    } else {
                        throw updateError;
                    }
                }
            }

            setPrivateKey(keys.privateKey);
            const unlockedLegacyKeys = await loadLegacyPrivateKeys(pin, publicKeyStr);
            setLegacyPrivateKeys(unlockedLegacyKeys);
            const jwk = await window.crypto.subtle.exportKey("jwk", keys.privateKey);
            sessionStorage.setItem('unlocked_vault', JSON.stringify(jwk));
            await persistLegacyKeysToSession(unlockedLegacyKeys);
            console.log("New vault initialized and synced.");
        } catch (e: any) {
            console.error("Setup failed", e);
            throw new Error(e.message || "Failed to initialize new vault.");
        }
    };


    return (
        <AuthContext.Provider value={{ user, loading, privateKey, legacyPrivateKeys, loginEmail, loginPhone, loginGoogle, sendPhoneOTP, logout, unlockKeys, resetKeys, checkKeys, setupNewVault }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};
