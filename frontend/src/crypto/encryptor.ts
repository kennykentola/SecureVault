export const HybridEncryptor = {
    metrics: {
        lastEncryptionTime: 0,
        lastDecryptionTime: 0,
        encryptionType: "AES-256 + RSA-2048",
        hashingType: "SHA-256"
    },

    // 1. Core Logic: Encrypt a symmetric key for a specific RSA public key
    encryptKeyWithRSA: async (rawAesKey: ArrayBuffer | string, publicKey: CryptoKey): Promise<string> => {
        let buffer: ArrayBuffer;
        if (typeof rawAesKey === 'string') {
            // Convert Base64 string to ArrayBuffer
            const binary = atob(rawAesKey);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            buffer = bytes.buffer;
        } else {
            buffer = rawAesKey;
        }

        const encryptedAesKey = await window.crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            publicKey,
            buffer
        );
        return btoa(String.fromCharCode(...new Uint8Array(encryptedAesKey)));
    },

    // 2a. Core Logic: Encrypt plaintext with a specific AES key
    encryptSymmetric: async (plaintext: string, aesKey: CryptoKey) => {
        const startTime = performance.now();
        const encoder = new TextEncoder();
        const data = encoder.encode(plaintext);
        const iv = window.crypto.getRandomValues(new Uint8Array(16));
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: "AES-CBC", iv },
            aesKey,
            data
        );

        const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        HybridEncryptor.metrics.lastEncryptionTime = performance.now() - startTime;

        return {
            ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
            iv: btoa(String.fromCharCode(...iv)),
            hash: hashHex,
            latency: HybridEncryptor.metrics.lastEncryptionTime
        };
    },

    // 2b. Core Logic: Decrypt ciphertext with a specific AES key
    decryptSymmetric: async (payload: any, aesKey: CryptoKey) => {
        const startTime = performance.now();
        try {
            const ciphertextBuffer = new Uint8Array(atob(payload.ciphertext).split('').map(c => c.charCodeAt(0)));
            const ivBuffer = new Uint8Array(atob(payload.iv || payload.iv_b64).split('').map(c => c.charCodeAt(0)));
            
            const algoName = aesKey.algorithm.name;
            const decryptedBuffer = await window.crypto.subtle.decrypt(
                { name: algoName, iv: ivBuffer } as any,
                aesKey,
                ciphertextBuffer
            );

            const decoder = new TextDecoder();
            const decryptedText = decoder.decode(decryptedBuffer);

            // Verify Integrity
            const hashBuffer = await window.crypto.subtle.digest("SHA-256", decryptedBuffer);
            const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

            if (hashHex !== payload.hash) {
                throw new Error("Integrity check failed: Hash mismatch!");
            }

            HybridEncryptor.metrics.lastDecryptionTime = performance.now() - startTime;
            return decryptedText;
        } catch (e) {
            console.error("Symmetric decryption failed:", e);
            throw e;
        }
    },

    // 3. Convenience: Standard Hybrid Encryption (Single Recipient)
    encrypt: async (plaintext: string, recipientPublicKey: CryptoKey) => {
        const aesKey = await window.crypto.subtle.generateKey(
            { name: "AES-CBC", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );

        const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
        const encrypted = await HybridEncryptor.encryptSymmetric(plaintext, aesKey);
        const encryptedKey = await HybridEncryptor.encryptKeyWithRSA(rawAesKey, recipientPublicKey);

        return {
            ...encrypted,
            encryptedKey
        };
    },

    // 4. Core Logic: Decrypt a symmetric key byte-array with RSA private key
    decryptKeyWithRSA: async (encryptedKeyB64: string, privateKey: CryptoKey): Promise<string> => {
        const encryptedBuffer = new Uint8Array(atob(encryptedKeyB64).split('').map(c => c.charCodeAt(0)));
        const rawKey = await window.crypto.subtle.decrypt(
            { name: "RSA-OAEP" },
            privateKey,
            encryptedBuffer
        );
        return btoa(String.fromCharCode(...new Uint8Array(rawKey)));
    },

    // 5. Convenience: Decrypt message using own private key
    decrypt: async (payload: any, privateKey: CryptoKey) => {
        if (!privateKey) throw new Error("VAULT_LOCKED");

        try {
            // Support both naming variations for keys from different versions/backend
            const encKey = payload.encryptedKey || payload.encrypted_key;
            if (!encKey) throw new Error("Missing encrypted key in payload");

            // 1. Decrypt the AES key using RSA private key
            const decryptedKeyB64 = await HybridEncryptor.decryptKeyWithRSA(encKey, privateKey);
            const aesKey = await window.crypto.subtle.importKey(
                "raw",
                new Uint8Array(atob(decryptedKeyB64).split('').map(c => c.charCodeAt(0))),
                { name: "AES-CBC" },
                true,
                ["decrypt"]
            );

            // 2. Use Symmetric Decrypt logic
            return await HybridEncryptor.decryptSymmetric(payload, aesKey);
        } catch (e: any) {
            if (e.name === "OperationError") {
                // Identity Mismatch detected. System handles this via Session Repair.
                throw new Error("IDENTITY_MISMATCH");
            }
            throw e;
        }
    },

    // 6. Helper: Simulate Tampering (Bit Flipping)
    tamperPayload: (payload: any) => {
        const tampered = { ...payload };
        try {
            const binary = atob(tampered.ciphertext);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            
            // Flip the first bit of the first byte
            bytes[0] = bytes[0] ^ 1;
            
            tampered.ciphertext = btoa(String.fromCharCode(...bytes));
            return tampered;
        } catch (e) {
            return tampered;
        }
    },

    // 7. File Support: Generate a random key for file encryption
    generateFileKey: async () => {
        return await window.crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    },

    encryptFile: async (fileBlob: Blob, aesKey: CryptoKey) => {
        const arrayBuffer = await fileBlob.arrayBuffer();
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            aesKey,
            arrayBuffer
        );
        return { blob: new Blob([encrypted]), iv: btoa(String.fromCharCode(...iv)) };
    },

    decryptFile: async (fileBlob: Blob, aesKey: CryptoKey, ivB64: string) => {
        const arrayBuffer = await fileBlob.arrayBuffer();
        const iv = new Uint8Array(atob(ivB64).split('').map(c => c.charCodeAt(0)));
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            aesKey,
            arrayBuffer
        );
        return new Blob([decrypted]);
    }
};

