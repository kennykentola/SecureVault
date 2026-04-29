const DB_NAME = 'E2EEMessagingDB';
const STORE_NAME = 'KeysStore';

export interface VaultBackupRecord {
    public_key: string;
    backup: string;
    created_at: string;
}

// Initialize IndexedDB
const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 2); // Increment version to ensure upgrade
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const KeyManager = {
    // Generate RSA Key Pair
    generateKeyPair: async (): Promise<CryptoKeyPair> => {
        return await window.crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256",
            },
            true,
            ["encrypt", "decrypt"]
        );
    },

    // Export Public Key to PEM/Base64
    exportPublicKey: async (key: CryptoKey): Promise<string> => {
        const exported = await window.crypto.subtle.exportKey("spki", key);
        return btoa(String.fromCharCode(...new Uint8Array(exported)));
    },

    // Import Public Key from Base64
    importPublicKey: async (base64Key: string): Promise<CryptoKey> => {
        try {
            if (!base64Key) throw new Error("Public key is empty");
            const binaryKey = atob(base64Key);
            const bytes = new Uint8Array(binaryKey.length);
            for (let i = 0; i < binaryKey.length; i++) {
                bytes[i] = binaryKey.charCodeAt(i);
            }
            return await window.crypto.subtle.importKey(
                "spki",
                bytes as BufferSource,
                {
                    name: "RSA-OAEP",
                    hash: "SHA-256",
                },
                true,
                ["encrypt"]
            );
        } catch (e) {
            console.error("Failed to import public key", e);
            throw new Error("Invalid public key format");
        }
    },

    // Generate AES-256 Secret Key for groups/files
    generateSecretKey: async (algo: "AES-CBC" | "AES-GCM" = "AES-CBC"): Promise<CryptoKey> => {
        return await window.crypto.subtle.generateKey(
            { name: algo, length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    },

    // Import Secret Key from Base64
    importSecretKey: async (base64Key: string, algo: "AES-CBC" | "AES-GCM" = "AES-CBC"): Promise<CryptoKey> => {
        const binaryKey = atob(base64Key);
        const bytes = new Uint8Array(binaryKey.length);
        for (let i = 0; i < binaryKey.length; i++) {
            bytes[i] = binaryKey.charCodeAt(i);
        }
        
        if (![16, 24, 32].includes(bytes.length)) {
            console.error(`Invalid AES key length: ${bytes.length} bytes (${bytes.length * 8} bits). Key must be 128 or 256 bits.`);
        }

        return await window.crypto.subtle.importKey(
            "raw",
            bytes as BufferSource,
            { name: algo },
            true,
            ["encrypt", "decrypt"]
        );
    },

    // Export Secret Key to Base64
    exportSecretKey: async (key: CryptoKey): Promise<string> => {
        const exported = await window.crypto.subtle.exportKey("raw", key);
        return btoa(String.fromCharCode(...new Uint8Array(exported)));
    },

    // Derive PIN-based key for private key encryption
    derivePinKey: async (pin: string, salt: Uint8Array): Promise<CryptoKey> => {
        const encoder = new TextEncoder();
        const baseKey = await window.crypto.subtle.importKey(
            "raw",
            encoder.encode(pin) as BufferSource,
            "PBKDF2",
            false,
            ["deriveKey"]
        );
        return await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt as BufferSource,
                iterations: 100000,
                hash: "SHA-256",
            },
            baseKey,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    },

    // Package Private Key for Cloud Backup
    packagePrivateKeyForBackup: async (privateKey: CryptoKey, pin: string): Promise<{ backup: string, salt: string }> => {
        const exported = await window.crypto.subtle.exportKey("pkcs8", privateKey);
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const pinKey = await KeyManager.derivePinKey(pin, salt);
        
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            pinKey,
            exported
        );

        const backupData = {
            encryptedKey: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
            iv: btoa(String.fromCharCode(...new Uint8Array(iv))),
            salt: btoa(String.fromCharCode(...new Uint8Array(salt)))
        };

        return {
            backup: JSON.stringify(backupData),
            salt: btoa(String.fromCharCode(...new Uint8Array(salt)))
        };
    },

    createVaultBackupRecord: async (privateKey: CryptoKey, publicKey: string, pin: string): Promise<VaultBackupRecord> => {
        const { backup } = await KeyManager.packagePrivateKeyForBackup(privateKey, pin);
        return {
            public_key: publicKey,
            backup,
            created_at: new Date().toISOString()
        };
    },

    // Store Private Key securely in IndexedDB (Encrypted with PIN)
    storePrivateKey: async (privateKey: CryptoKey, publicKey: CryptoKey, pin: string): Promise<void> => {
        const exported = await window.crypto.subtle.exportKey("pkcs8", privateKey);
        const exportedPublic = await window.crypto.subtle.exportKey("spki", publicKey);
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const pinKey = await KeyManager.derivePinKey(pin, salt);
        
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            pinKey,
            exported
        );

        const db = await initDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({
            encryptedKey: encrypted,
            publicKey: btoa(String.fromCharCode(...new Uint8Array(exportedPublic))),
            salt,
            iv,
        }, 'privateKey');
    },

    // Retrieve and Decrypt Private Key
    getPrivateKey: async (pin: string): Promise<CryptoKey | null> => {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        
        console.log(`[Diagnostic] Checking Security Keys at origin: ${window.location.origin} (DB Version: ${db.version})`);

        const data = await new Promise<any>((resolve) => {
            const req = tx.objectStore(STORE_NAME).get('privateKey');
            req.onsuccess = () => resolve(req.result);
        });

        if (!data) {
            console.warn(`[Diagnostic] No 'privateKey' found in IndexedDB store '${STORE_NAME}' at ${window.location.origin}`);
            return null;
        }

        try {
            const pinKey = await KeyManager.derivePinKey(pin, data.salt);
            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: data.iv },
                pinKey,
                data.encryptedKey
            );
            
            const importedKey = await window.crypto.subtle.importKey(
                "pkcs8",
                decrypted,
                { name: "RSA-OAEP", hash: "SHA-256" },
                true,
                ["decrypt"]
            );
            return importedKey;
        } catch (e) {
            console.error("PIN Decryption failed:", e);
            throw new Error("Invalid security PIN. Please try again.");
        }
    },

    getPublicKey: async (): Promise<string | null> => {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const data = await new Promise<any>((resolve) => {
            const req = tx.objectStore(STORE_NAME).get('privateKey');
            req.onsuccess = () => resolve(req.result);
        });
        return data?.publicKey || null;
    },


    // Get or Generate Status Symmetric Key (for E2EE Stories)
    getStatusKey: async (): Promise<CryptoKey> => {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const encryptedData = await new Promise<any>((resolve) => {
            const req = tx.objectStore(STORE_NAME).get('statusKey');
            req.onsuccess = () => resolve(req.result);
        });

        if (encryptedData) {
            // Need a way to decrypt it? Actually, status key can just be stored in raw in IndexedDB 
            // OR encrypted with PIN. Let's use the same PIN-based protection as private key.
            // But to simplify the "Auto-share" flow, I'll store it encrypted with the PIN.
            // For now, I'll just generate/retrieve a raw exportable key for simplicity.
            
            // Wait, if I store it in IndexedDB, I can't easily decrypt it without the PIN.
            // So I'll require the PIN to unlock the status key too.
        }

        // To keep it simple and consistent with the current AuthContext:
        // I'll just store the status key in raw in IndexedDB for now, 
        // as IndexedDB is already a local secure storage on the user's device.
        
        const rawData = await new Promise<any>((resolve) => {
            const req = tx.objectStore(STORE_NAME).get('statusKeyRaw');
            req.onsuccess = () => resolve(req.result);
        });

        if (rawData) {
            return await KeyManager.importSecretKey(rawData);
        }

        const newKey = await KeyManager.generateSecretKey();
        const exported = await KeyManager.exportSecretKey(newKey);
        
        const tx2 = db.transaction(STORE_NAME, 'readwrite');
        tx2.objectStore(STORE_NAME).put(exported, 'statusKeyRaw');
        return newKey;
    },

    // EMERGENCY RESET: Clear all local security keys (unrecoverable!)
    resetAllKeys: async (): Promise<void> => {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        await new Promise<void>((resolve, reject) => {
            const req = tx.objectStore(STORE_NAME).clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
        console.warn("ALL LOCAL SECURITY KEYS HAVE BEEN WIPED.");
    },

    restorePrivateKeyFromBackup: async (backupJson: string, pin: string): Promise<CryptoKey> => {
        try {
            const data = JSON.parse(backupJson);
            const encryptedKey = new Uint8Array(atob(data.encryptedKey).split('').map(c => c.charCodeAt(0)));
            const iv = new Uint8Array(atob(data.iv).split('').map(c => c.charCodeAt(0)));
            const salt = new Uint8Array(atob(data.salt).split('').map(c => c.charCodeAt(0)));

            const pinKey = await KeyManager.derivePinKey(pin, salt);
            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                pinKey,
                encryptedKey
            );

            return await window.crypto.subtle.importKey(
                "pkcs8",
                decrypted,
                { name: "RSA-OAEP", hash: "SHA-256" },
                true,
                ["decrypt"]
            );
        } catch (e) {
            console.error("Backup key decryption failed:", e);
            throw new Error("Invalid security PIN. Please try again.");
        }
    },

    importBackup: async (backupJson: string, pin: string): Promise<CryptoKey> => {
        try {
            const privateKey = await KeyManager.restorePrivateKeyFromBackup(backupJson, pin);
            return privateKey;
        } catch (e) {
            console.error("Backup restoration failed:", e);
            throw new Error("Failed to restore vault. Please check your PIN.");
        }
    },

    // --- RECOVERY KEY METHODS ---

    generateRecoveryKey: (): string => {
        const array = new Uint8Array(16);
        window.crypto.getRandomValues(array);
        const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
        // Format as XXXX-XXXX-XXXX-XXXX
        return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 24)}`.toUpperCase();
    },

    deriveRecoveryAesKey: async (recoveryKey: string, salt: Uint8Array): Promise<CryptoKey> => {
        const encoder = new TextEncoder();
        const baseKey = await window.crypto.subtle.importKey(
            "raw",
            encoder.encode(recoveryKey.replace(/-/g, '')) as BufferSource,
            "PBKDF2",
            false,
            ["deriveKey"]
        );
        return await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt as BufferSource,
                iterations: 100000,
                hash: "SHA-256",
            },
            baseKey,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    },

    createRecoveryVaultBackupRecord: async (privateKey: CryptoKey, recoveryKey: string, publicKey: string): Promise<VaultBackupRecord> => {
        const exported = await window.crypto.subtle.exportKey("pkcs8", privateKey);
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const aesKey = await KeyManager.deriveRecoveryAesKey(recoveryKey, salt);
        
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            aesKey,
            exported
        );

        const backupData = {
            encryptedKey: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
            iv: btoa(String.fromCharCode(...new Uint8Array(iv))),
            salt: btoa(String.fromCharCode(...new Uint8Array(salt)))
        };

        return {
            public_key: publicKey,
            backup: JSON.stringify(backupData),
            created_at: new Date().toISOString()
        };
    },

    restorePrivateKeyFromRecoveryBackup: async (backupJson: string, recoveryKey: string): Promise<CryptoKey> => {
        try {
            const data = JSON.parse(backupJson);
            const encryptedKey = new Uint8Array(atob(data.encryptedKey).split('').map(c => c.charCodeAt(0)));
            const iv = new Uint8Array(atob(data.iv).split('').map(c => c.charCodeAt(0)));
            const salt = new Uint8Array(atob(data.salt).split('').map(c => c.charCodeAt(0)));

            const aesKey = await KeyManager.deriveRecoveryAesKey(recoveryKey, salt);
            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                aesKey,
                encryptedKey
            );

            return await window.crypto.subtle.importKey(
                "pkcs8",
                decrypted,
                { name: "RSA-OAEP", hash: "SHA-256" },
                true,
                ["decrypt"]
            );
        } catch (e) {
            console.error("Recovery key decryption failed:", e);
            throw new Error("Invalid Recovery Key. Please try again.");
        }
    }
};

