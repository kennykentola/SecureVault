const { webcrypto } = require('crypto');
const { performance } = require('perf_hooks');
const subtle = webcrypto.subtle;

async function runBenchmark() {
    const rsaKeyPair = await subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true, ["encrypt", "decrypt"]
    );
    const aesKey = await subtle.generateKey(
        { name: "AES-CBC", length: 256 },
        true, ["encrypt", "decrypt"]
    );
    const rawAesKey = await subtle.exportKey("raw", aesKey);

    // Warmup
    await subtle.encrypt({ name: "RSA-OAEP" }, rsaKeyPair.publicKey, rawAesKey);

    const sizes = [100, 1000, 5000, 10000]; // in characters
    const results = {};

    for (const chars of sizes) {
        const text = "A".repeat(chars);
        const data = new TextEncoder().encode(text);
        
        let rsaEncAvg = 0; let rsaDecAvg = 0;
        let aesEncAvg = 0; let aesDecAvg = 0;
        let hashAvg = 0;
        
        for (let i = 0; i < 50; i++) {
            // RSA Enc
            let t0 = performance.now();
            const encryptedKey = await subtle.encrypt({ name: "RSA-OAEP" }, rsaKeyPair.publicKey, rawAesKey);
            rsaEncAvg += performance.now() - t0;
            
            // RSA Dec
            t0 = performance.now();
            await subtle.decrypt({ name: "RSA-OAEP" }, rsaKeyPair.privateKey, encryptedKey);
            rsaDecAvg += performance.now() - t0;
            
            // AES Enc
            const iv = webcrypto.getRandomValues(new Uint8Array(16));
            t0 = performance.now();
            const ciphertext = await subtle.encrypt({ name: "AES-CBC", iv }, aesKey, data);
            aesEncAvg += performance.now() - t0;
            
            // AES Dec
            t0 = performance.now();
            await subtle.decrypt({ name: "AES-CBC", iv }, aesKey, ciphertext);
            aesDecAvg += performance.now() - t0;
            
            // Hash
            t0 = performance.now();
            await subtle.digest("SHA-256", data);
            hashAvg += performance.now() - t0;
        }

        results[chars] = {
            rsaEnc: (rsaEncAvg / 50).toFixed(4),
            rsaDec: (rsaDecAvg / 50).toFixed(4),
            aesEnc: (aesEncAvg / 50).toFixed(4),
            aesDec: (aesDecAvg / 50).toFixed(4),
            hash: (hashAvg / 50).toFixed(4)
        };
    }
    
    console.log(JSON.stringify(results, null, 2));
}

runBenchmark().catch(console.error);
