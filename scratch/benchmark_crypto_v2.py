import time
import os
import base64
import hashlib
from datetime import datetime
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

class BenchmarkCrypto:
    @staticmethod
    def generate_rsa_keypair():
        priv = rsa.generate_private_key(
            public_exponent=65537, key_size=2048, backend=default_backend()
        )
        return priv, priv.public_key()

    @staticmethod
    def encrypt_key_with_rsa(raw_aes: bytes, pub) -> bytes:
        return pub.encrypt(
            raw_aes,
            padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None)
        )

    @staticmethod
    def decrypt_key_with_rsa(enc: bytes, priv) -> bytes:
        return priv.decrypt(
            enc,
            padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None)
        )

    @staticmethod
    def encrypt_symmetric(plaintext: str, aes_key: bytes) -> dict:
        iv = os.urandom(16)
        data = plaintext.encode("utf-8")
        pad = 16 - (len(data) % 16)
        padded = data + bytes([pad] * pad)
        enc = Cipher(algorithms.AES(aes_key), modes.CBC(iv), backend=default_backend()).encryptor()
        ct = enc.update(padded) + enc.finalize()
        return {
            "ciphertext": ct,
            "iv": iv,
            "hash": hashlib.sha256(data).hexdigest(),
        }

    @staticmethod
    def decrypt_symmetric(payload: dict, aes_key: bytes) -> str:
        ct = payload["ciphertext"]
        iv = payload["iv"]
        dec = Cipher(algorithms.AES(aes_key), modes.CBC(iv), backend=default_backend()).decryptor()
        padded = dec.update(ct) + dec.finalize()
        pad = padded[-1]
        data = padded[:-pad]
        return data.decode("utf-8")

def run_benchmark():
    crypto = BenchmarkCrypto()
    print("Generating RSA keys...")
    priv, pub = crypto.generate_rsa_keypair()
    
    aes_key = os.urandom(32)
    
    sizes = [100, 1000, 5000, 10000] # characters
    
    print(f"{'Size (chars)':<15} | {'RSA Enc (ms)':<15} | {'RSA Dec (ms)':<15} | {'AES Enc (ms)':<15} | {'AES Dec (ms)':<15} | {'SHA-256 (ms)':<15}")
    print("-" * 90)
    
    for size in sizes:
        text = "A" * size
        
        # RSA
        start = time.time()
        enc_aes_key = crypto.encrypt_key_with_rsa(aes_key, pub)
        rsa_enc_time = (time.time() - start) * 1000
        
        start = time.time()
        dec_aes_key = crypto.decrypt_key_with_rsa(enc_aes_key, priv)
        rsa_dec_time = (time.time() - start) * 1000
        
        # AES
        start = time.time()
        payload = crypto.encrypt_symmetric(text, aes_key)
        aes_enc_time = (time.time() - start) * 1000
        
        start = time.time()
        decrypted = crypto.decrypt_symmetric(payload, aes_key)
        aes_dec_time = (time.time() - start) * 1000
        
        # SHA-256
        start = time.time()
        h = hashlib.sha256(text.encode()).hexdigest()
        sha_time = (time.time() - start) * 1000
        
        print(f"{size:<15} | {rsa_enc_time:<15.4f} | {rsa_dec_time:<15.4f} | {aes_enc_time:<15.4f} | {aes_dec_time:<15.4f} | {sha_time:<15.4f}")

if __name__ == "__main__":
    run_benchmark()
