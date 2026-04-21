import { HybridEncryptor } from './encryptor';

export class FileEncryptor {
    /**
     * Encrypts a file using a random AES-256-GCM key.
     * The key is then encrypted with the recipient's RSA public key.
     */
    static async encryptFile(file: File, recipientPublicKey: CryptoKey) {
        // 1. Generate a random AES key for this file
        const aesKey = await window.crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );

        // 2. Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        // 3. Generate IV
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        // 4. Encrypt file data
        const ciphertextBuffer = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            arrayBuffer
        );

        // 5. Encrypt the AES key itself using the recipient's RSA Public Key
        const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
        const aesKeyString = btoa(String.fromCharCode(...new Uint8Array(rawAesKey)));
        const encryptedAesKey = await HybridEncryptor.encryptKeyWithRSA(aesKeyString, recipientPublicKey);

        // 6. Return bundle
        return {
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer))),
            encryptedKey: encryptedAesKey,
            iv: btoa(String.fromCharCode(...iv))
        };
    }

    /**
     * Decrypts an encrypted file bundle using the recipient's private key.
     */
    static async decryptFile(bundle: any, privateKey: CryptoKey) {
        // 1. Decrypt the AES key string from RSA
        const aesKeyString = await HybridEncryptor.decryptKeyWithRSA(bundle.encryptedKey, privateKey);
        
        // 2. Import the AES key
        const rawAesKey = new Uint8Array(atob(aesKeyString).split('').map(c => c.charCodeAt(0)));
        const aesKey = await window.crypto.subtle.importKey(
            'raw',
            rawAesKey,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );

        // 3. Decrypt ciphertext
        const iv = new Uint8Array(atob(bundle.iv).split('').map(c => c.charCodeAt(0)));
        const ciphertext = new Uint8Array(atob(bundle.ciphertext).split('').map(c => c.charCodeAt(0)));

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            ciphertext
        );

        return new Blob([decryptedBuffer], { type: bundle.mimeType });
    }
}
