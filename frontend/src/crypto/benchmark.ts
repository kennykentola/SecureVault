import { HybridEncryptor } from "./encryptor";

export const runCryptoBenchmark = async (messageSizeKB: number = 1) => {
    console.log(`Starting Cryptographic Benchmark (Payload: ${messageSizeKB}KB)...`);
    
    // Generate mock payload
    const payload = "A".repeat(messageSizeKB * 1024);
    
    // 1. Generate RSA Keys (Receiver)
    const rsaKeyPair = await window.crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256"
        },
        true,
        ["encrypt", "decrypt"]
    );

    // 2. Generate AES Key (Sender)
    const aesKey = await window.crypto.subtle.generateKey(
        { name: "AES-CBC", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
    const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);

    // BENCHMARK: RSA Key Encryption (Key Exchange)
    const t0_rsaEnc = performance.now();
    const encryptedKey = await HybridEncryptor.encryptKeyWithRSA(rawAesKey, rsaKeyPair.publicKey);
    const timeRsaEnc = performance.now() - t0_rsaEnc;

    // BENCHMARK: AES Encryption + SHA-256
    const encryptedMessage = await HybridEncryptor.encryptSymmetric(payload, aesKey);
    const timeAesEnc = HybridEncryptor.metrics.lastEncryptionTime;

    // BENCHMARK: RSA Key Decryption
    const t0_rsaDec = performance.now();
    await HybridEncryptor.decryptKeyWithRSA(encryptedKey, rsaKeyPair.privateKey);
    const timeRsaDec = performance.now() - t0_rsaDec;

    // BENCHMARK: AES Decryption + SHA-256 Verification
    await HybridEncryptor.decryptSymmetric(encryptedMessage, aesKey);
    const timeAesDec = HybridEncryptor.metrics.lastDecryptionTime;

    // BENCHMARK: Isolated SHA-256 Hashing
    const encoder = new TextEncoder();
    const t0_hash = performance.now();
    await window.crypto.subtle.digest("SHA-256", encoder.encode(payload));
    const timeHash = performance.now() - t0_hash;

    const results = {
        "Payload Size": `${messageSizeKB}KB`,
        "AES-256 Encrypt (ms)": parseFloat(timeAesEnc.toFixed(2)),
        "AES-256 Decrypt (ms)": parseFloat(timeAesDec.toFixed(2)),
        "SHA-256 Hash (ms)": parseFloat(timeHash.toFixed(2)),
        "RSA-2048 Key Wrap (ms)": parseFloat(timeRsaEnc.toFixed(2)),
        "RSA-2048 Key Unwrap (ms)": parseFloat(timeRsaDec.toFixed(2))
    };

    console.table([results]);
    return results;
};

// Mount to window for easy execution in browser console
(window as any).runCryptoBenchmark = runCryptoBenchmark;
