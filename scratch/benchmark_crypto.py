import time
import os
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_OAEP
from Crypto.Hash import SHA256

def benchmark():
    # Setup RSA
    print("Generating RSA keys...")
    key = RSA.generate(2048)
    private_key = key.export_key()
    public_key = key.publickey().export_key()
    
    rsa_public = RSA.import_key(public_key)
    rsa_private = RSA.import_key(private_key)
    cipher_rsa = PKCS1_OAEP.new(rsa_public)
    cipher_rsa_dec = PKCS1_OAEP.new(rsa_private)
    
    # Setup AES
    aes_key = os.urandom(32) # 256 bits
    iv = os.urandom(16)
    
    sizes = [100, 1000, 5000, 10000] # characters
    
    print(f"{'Size (chars)':<15} | {'RSA Enc (ms)':<15} | {'RSA Dec (ms)':<15} | {'AES Enc (ms)':<15} | {'AES Dec (ms)':<15} | {'SHA-256 (ms)':<15}")
    print("-" * 90)
    
    for size in sizes:
        text = "A" * size
        data = text.encode()
        
        # RSA (usually for keys, but we benchmark one op)
        start = time.time()
        enc_aes_key = cipher_rsa.encrypt(aes_key)
        rsa_enc_time = (time.time() - start) * 1000
        
        start = time.time()
        dec_aes_key = cipher_rsa_dec.decrypt(enc_aes_key)
        rsa_dec_time = (time.time() - start) * 1000
        
        # AES
        cipher_aes = AES.new(aes_key, AES.MODE_CBC, iv)
        start = time.time()
        ciphertext = cipher_aes.encrypt(pad(data, AES.block_size))
        aes_enc_time = (time.time() - start) * 1000
        
        cipher_aes_dec = AES.new(aes_key, AES.MODE_CBC, iv)
        start = time.time()
        decrypted = unpad(cipher_aes_dec.decrypt(ciphertext), AES.block_size)
        aes_dec_time = (time.time() - start) * 1000
        
        # SHA-256
        start = time.time()
        h = SHA256.new(data)
        digest = h.hexdigest()
        sha_time = (time.time() - start) * 1000
        
        print(f"{size:<15} | {rsa_enc_time:<15.4f} | {rsa_dec_time:<15.4f} | {aes_enc_time:<15.4f} | {aes_dec_time:<15.4f} | {sha_time:<15.4f}")

if __name__ == "__main__":
    benchmark()
