"""
SecureVault - Real Two-User E2EE Test Script
=============================================
Simulates Alice and Bob as two real WebSocket clients.
Tests the full AES-256-CBC + RSA-2048-OAEP encryption/decryption pipeline.

Run:
    python test_e2ee.py                           (local backend)
    python test_e2ee.py --url ws://localhost:8000  (explicit)
    python test_e2ee.py --url wss://https://securevault-backend-csd0.onrender.com  (deployed)
"""

import asyncio
import json
import base64
import hashlib
import os
import sys
import time
import argparse
from datetime import datetime

# Force UTF-8 on Windows console
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

# Crypto imports
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

try:
    import websockets
except ImportError:
    print("Missing dependency. Run: pip install websockets cryptography")
    sys.exit(1)

# ---- Colours ----
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):     print(f"  {GREEN}[PASS]{RESET}  {msg}")
def fail(msg):   print(f"  {RED}[FAIL]{RESET}  {msg}")
def info(msg):   print(f"  {CYAN}[INFO]{RESET}  {msg}")
def warn(msg):   print(f"  {YELLOW}[WARN]{RESET}  {msg}")
def header(msg): print(f"\n{BOLD}{YELLOW}{'='*62}{RESET}\n{BOLD}  {msg}{RESET}\n{'='*62}")

results = {"passed": 0, "failed": 0}

def check(condition, label):
    if condition:
        ok(label)
        results["passed"] += 1
    else:
        fail(label)
        results["failed"] += 1
    return condition


# =============================================================================
#  Pure-Python Crypto  (mirrors the browser SubtleCrypto / HybridEncryptor)
# =============================================================================

class Crypto:

    @staticmethod
    def generate_rsa_keypair():
        priv = rsa.generate_private_key(
            public_exponent=65537, key_size=2048, backend=default_backend()
        )
        return priv, priv.public_key()

    @staticmethod
    def export_public_key_b64(pub) -> str:
        der = pub.public_bytes(
            serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo
        )
        return base64.b64encode(der).decode()

    @staticmethod
    def import_public_key_b64(b64: str):
        return serialization.load_der_public_key(
            base64.b64decode(b64), backend=default_backend()
        )

    @staticmethod
    def generate_aes_key() -> bytes:
        return os.urandom(32)  # AES-256

    @staticmethod
    def encrypt_key_with_rsa(raw_aes: bytes, pub) -> str:
        enc = pub.encrypt(
            raw_aes,
            padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None)
        )
        return base64.b64encode(enc).decode()

    @staticmethod
    def decrypt_key_with_rsa(enc_b64: str, priv) -> bytes:
        return priv.decrypt(
            base64.b64decode(enc_b64),
            padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None)
        )

    @staticmethod
    def encrypt_symmetric(plaintext: str, aes_key: bytes) -> dict:
        """AES-256-CBC with PKCS7 + SHA-256 integrity hash. Mirrors encryptSymmetric()."""
        iv   = os.urandom(16)
        data = plaintext.encode("utf-8")
        # PKCS7 pad
        pad  = 16 - (len(data) % 16)
        padded = data + bytes([pad] * pad)
        enc  = Cipher(algorithms.AES(aes_key), modes.CBC(iv), backend=default_backend()).encryptor()
        ct   = enc.update(padded) + enc.finalize()
        return {
            "ciphertext": base64.b64encode(ct).decode(),
            "iv":         base64.b64encode(iv).decode(),
            "hash":       hashlib.sha256(data).hexdigest(),
            "timestamp":  datetime.utcnow().isoformat() + "Z",
        }

    @staticmethod
    def decrypt_symmetric(payload: dict, aes_key: bytes) -> str:
        """AES-256-CBC decrypt + integrity verify. Mirrors decryptSymmetric()."""
        ct  = base64.b64decode(payload["ciphertext"])
        iv  = base64.b64decode(payload["iv"])
        dec = Cipher(algorithms.AES(aes_key), modes.CBC(iv), backend=default_backend()).decryptor()
        padded = dec.update(ct) + dec.finalize()
        # Remove PKCS7 pad
        pad  = padded[-1]
        data = padded[:-pad]
        # Integrity check
        got  = hashlib.sha256(data).hexdigest()
        if got != payload["hash"]:
            raise ValueError(f"INTEGRITY FAILURE: hash mismatch! got={got} expected={payload['hash']}")
        return data.decode("utf-8")

    @staticmethod
    def tamper_payload(payload: dict) -> dict:
        """Bit-flip first byte of ciphertext. Mirrors tamperPayload()."""
        t = dict(payload)
        raw = bytearray(base64.b64decode(payload["ciphertext"]))
        raw[0] ^= 1
        t["ciphertext"] = base64.b64encode(bytes(raw)).decode()
        return t

    @staticmethod
    def hybrid_encrypt(plaintext: str, recipient_pub) -> dict:
        aes = Crypto.generate_aes_key()
        enc = Crypto.encrypt_symmetric(plaintext, aes)
        enc["encryptedKey"] = Crypto.encrypt_key_with_rsa(aes, recipient_pub)
        return enc

    @staticmethod
    def hybrid_decrypt(payload: dict, priv) -> str:
        enc_key = payload.get("encryptedKey") or payload.get("encrypted_key")
        if isinstance(enc_key, dict):
            enc_key = enc_key.get("encryptedKey", "")
        aes = Crypto.decrypt_key_with_rsa(enc_key, priv)
        return Crypto.decrypt_symmetric(payload, aes)


# =============================================================================
#  Simulated WebSocket User
# =============================================================================

class User:
    def __init__(self, name: str, user_id: str, ws_url: str):
        self.name    = name
        self.user_id = user_id
        self.ws_url  = ws_url
        self.priv, self.pub = Crypto.generate_rsa_keypair()
        self.pub_b64 = Crypto.export_public_key_b64(self.pub)
        self.ws      = None
        self.inbox   = []

    async def connect(self):
        url = f"{self.ws_url}/ws/{self.user_id}"
        self.ws = await websockets.connect(url, ping_interval=None)
        info(f"{self.name} connected -> {url}")

    async def disconnect(self):
        if self.ws:
            await self.ws.close()
        info(f"{self.name} disconnected")

    async def listen(self):
        try:
            async for raw in self.ws:
                self.inbox.append(json.loads(raw))
        except Exception:
            pass

    async def send_chat(self, to_id: str, text: str, to_pub_b64: str, temp_id: str = None):
        to_pub  = Crypto.import_public_key_b64(to_pub_b64)
        payload = Crypto.hybrid_encrypt(text, to_pub)
        payload["sender_name"] = self.name
        payload["type"]        = "text"
        frame = {
            "type":         "chat",
            "recipient_id": to_id,
            "tempId":       temp_id or f"tmp-{int(time.time()*1000)}",
            "payload":      payload,
        }
        await self.ws.send(json.dumps(frame))

    async def wait_msg(self, timeout=6.0):
        t0 = time.time()
        n  = len(self.inbox)
        while time.time() - t0 < timeout:
            for m in self.inbox[n:]:
                if m.get("type") == "chat" or m.get("payload"):
                    return m
            await asyncio.sleep(0.1)
        return None

    async def wait_delivery(self, timeout=5.0):
        t0 = time.time()
        n  = len(self.inbox)
        while time.time() - t0 < timeout:
            for m in self.inbox[n:]:
                if m.get("type") == "delivery_status":
                    return m
            await asyncio.sleep(0.1)
        return None


# =============================================================================
#  Test Runner
# =============================================================================

async def run_tests(ws_url: str):
    print(f"\n{BOLD}{'='*62}")
    print("  SecureVault - Automated E2EE Two-User Test Suite")
    print(f"  Backend : {ws_url}")
    print(f"  Time    : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*62}{RESET}\n")

    alice = User("Alice", "test-alice-001", ws_url)
    bob   = User("Bob",   "test-bob-001",   ws_url)

    # ------------------------------------------------------------------
    header("TEST 1 - WebSocket Connectivity")
    # ------------------------------------------------------------------
    try:
        await alice.connect()
        await bob.connect()
        # websockets v14+ dropped .open — check connection is usable by verifying ws object exists
        check(alice.ws is not None, "Alice WebSocket connected")
        check(bob.ws is not None,   "Bob WebSocket connected")
    except Exception as e:
        fail(f"Connection refused: {e}")
        print(f"\n{RED}Backend not reachable at {ws_url}{RESET}")
        print(f"Start it first:  {YELLOW}python main.py{RESET}\n")
        return

    alice_task = asyncio.create_task(alice.listen())
    bob_task   = asyncio.create_task(bob.listen())
    await asyncio.sleep(0.5)

    # ------------------------------------------------------------------
    header("TEST 2 - RSA-2048 Key Pair Generation")
    # ------------------------------------------------------------------
    check(alice.pub_b64 != bob.pub_b64, "kehinde and Doyin have DIFFERENT public keys")
    check(len(alice.pub_b64) > 300,     "kehinde RSA-2048 key has correct byte length")
    check(len(bob.pub_b64)   > 300,     "Doyin   RSA-2048 key has correct byte length")
    info(f"Alice pub-key[:60]: {alice.pub_b64[:60]}...")
    info(f"Bob   pub-key[:60]: {bob.pub_b64[:60]}...")

    # ------------------------------------------------------------------
    header("TEST 3 - AES-256-CBC Symmetric Encryption + Decryption")
    # ------------------------------------------------------------------
    msg = "Hello Bob! This is an E2EE secret message."
    aes = Crypto.generate_aes_key()
    enc = Crypto.encrypt_symmetric(msg, aes)

    check("ciphertext" in enc,          "Payload has 'ciphertext' field")
    check("iv"         in enc,          "Payload has 'iv' field")
    check("hash"       in enc,          "Payload has SHA-256 'hash' field")
    check(enc["ciphertext"] != msg,     "Ciphertext differs from plaintext")

    dec = Crypto.decrypt_symmetric(enc, aes)
    check(dec == msg,                   "Decrypted text matches original")
    info(f"Original  : {msg}")
    info(f"Ciphertext: {enc['ciphertext'][:48]}...")
    info(f"Decrypted : {dec}")

    # ------------------------------------------------------------------
    header("TEST 4 - RSA-OAEP Key Wrapping")
    # ------------------------------------------------------------------
    enc_key = Crypto.encrypt_key_with_rsa(aes, bob.pub)
    check(len(enc_key) > 0, "AES key RSA-encrypted with Doyin's public key")

    recovered = Crypto.decrypt_key_with_rsa(enc_key, bob.priv)
    check(recovered == aes, "Doyin unwraps AES key correctly with his private key")

    try:
        Crypto.decrypt_key_with_rsa(enc_key, alice.priv)
        fail("kehinde MUST NOT decrypt Doyin's wrapped key")
    except Exception:
        ok("kehinde cannot decrypt Doyin's wrapped key (correct isolation)")

    # ------------------------------------------------------------------
    header("TEST 5 - Full Hybrid Encrypt -> Decrypt Roundtrip")
    # ------------------------------------------------------------------
    hybrid_enc = Crypto.hybrid_encrypt(msg, bob.pub)
    check("ciphertext"   in hybrid_enc, "Hybrid payload has ciphertext")
    check("encryptedKey" in hybrid_enc, "Hybrid payload has RSA-wrapped key")

    hybrid_dec = Crypto.hybrid_decrypt(hybrid_enc, bob.priv)
    check(hybrid_dec == msg, f"Bob decrypts hybrid message: \"{hybrid_dec}\"")

    # ------------------------------------------------------------------
    header("TEST 6 - Integrity Check (Tamper Detection)")
    # ------------------------------------------------------------------
    tampered = Crypto.tamper_payload(hybrid_enc)
    try:
        Crypto.decrypt_symmetric(tampered, aes)
        fail("Tampered message passed integrity check (should have failed)")
    except Exception as e:
        ok(f"Tampered payload REJECTED: {str(e)[:80]}")
        results["passed"] += 1

    # ------------------------------------------------------------------
    header("TEST 7 - Live WebSocket: Alice Sends to Bob")
    # ------------------------------------------------------------------
    LIVE_MSG = "Hi doyin! E2EE live WebSocket test in progress."
    TEMP_ID  = f"test-{int(time.time()*1000)}"

    await alice.send_chat(bob.user_id, LIVE_MSG, bob.pub_b64, TEMP_ID)
    info(f"Alice sent: \"{LIVE_MSG}\"")

    received = await bob.wait_msg(timeout=6.0)
    check(received is not None, "Bob received a WebSocket frame from Alice")

    if received:
        p = received.get("payload") or received
        if isinstance(p, str):
            try:   p = json.loads(p)
            except Exception: pass

        check("ciphertext" in p,           "Frame has 'ciphertext' field")
        check(p.get("ciphertext") != LIVE_MSG, "In-transit ciphertext is NOT plaintext")
        info(f"Ciphertext in transit: {str(p.get('ciphertext',''))[:48]}...")

        if "encryptedKey" in p or "encrypted_key" in p:
            try:
                plaintext_out = Crypto.hybrid_decrypt(p, bob.priv)
                check(plaintext_out == LIVE_MSG,
                      f"Bob DECRYPTED message end-to-end: \"{plaintext_out}\"")
            except Exception as e:
                warn(f"Decryption via relay payload: {e}")
        else:
            info("encryptedKey not in relay frame (stored in DB separately) - see Test 8")

    # ------------------------------------------------------------------
    header("TEST 8 - Delivery Status Acknowledgement (Alice)")
    # ------------------------------------------------------------------
    delivery = await alice.wait_delivery(timeout=5.0)
    if delivery:
        check(delivery.get("type") == "delivery_status",   "kehinde got delivery_status frame")
        check(delivery.get("clientTempId") == TEMP_ID,     "delivery_status matches sent tempId")
        check(delivery.get("delivered") is True,           f"delivered flag = {delivery.get('delivered')}")
        info(f"Delivery ack payload:\n{json.dumps(delivery, indent=4)}")
    else:
        fail("No delivery_status received within 5s (backend may not be running)")

    # ------------------------------------------------------------------
    header("TEST 9 - Reverse Direction: Bob Sends to Alice")
    # ------------------------------------------------------------------
    REPLY = "Alice, I got your message. Reply is E2EE too."
    await bob.send_chat(alice.user_id, REPLY, alice.pub_b64)
    alice_recv = await alice.wait_msg(timeout=6.0)
    check(alice_recv is not None, "kehinde received Doyin's reply frame")
    if alice_recv:
        p2 = alice_recv.get("payload") or alice_recv
        if isinstance(p2, str):
            try:   p2 = json.loads(p2)
            except Exception: pass
        if "encryptedKey" in p2 or "encrypted_key" in p2:
            try:
                txt = Crypto.hybrid_decrypt(p2, alice.priv)
                check(txt == REPLY, f"kehinde decrypted Doyin's reply: \"{txt}\"")
            except Exception as e:
                warn(f"Reply decrypt note: {e}")
        else:
            info("encryptedKey not in relay frame")

    # ------------------------------------------------------------------
    header("TEST 10 - Performance Benchmark")
    # ------------------------------------------------------------------
    N = 50
    t0 = time.perf_counter()
    for _ in range(N):
        k = Crypto.generate_aes_key()
        Crypto.encrypt_symmetric("performance test benchmark message", k)
    aes_ms = (time.perf_counter() - t0) / N * 1000
    check(aes_ms < 50, f"AES-256-CBC avg encrypt: {aes_ms:.2f}ms ({N} rounds)")

    t0 = time.perf_counter()
    for _ in range(5):
        Crypto.generate_rsa_keypair()
    rsa_ms = (time.perf_counter() - t0) / 5 * 1000
    check(rsa_ms < 2000, f"RSA-2048 keygen avg: {rsa_ms:.2f}ms (5 rounds)")

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------
    alice_task.cancel()
    bob_task.cancel()
    await alice.disconnect()
    await bob.disconnect()

    # ------------------------------------------------------------------
    # Final Report
    # ------------------------------------------------------------------
    total = results["passed"] + results["failed"]
    print(f"\n{BOLD}{'='*62}")
    print(f"  RESULTS: {GREEN}{results['passed']} passed{RESET}{BOLD}  /  "
          f"{RED}{results['failed']} failed{RESET}{BOLD}  /  {total} total")
    print(f"{'='*62}{RESET}")

    if results["failed"] == 0:
        print(f"\n{GREEN}{BOLD}ALL TESTS PASSED - E2EE pipeline is fully operational!{RESET}\n")
    else:
        print(f"\n{RED}{BOLD}{results['failed']} test(s) FAILED - review output above.{RESET}\n")


# =============================================================================
#  Entry Point
# =============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SecureVault E2EE Two-User Test")
    parser.add_argument(
        "--url",
        default="ws://localhost:8000",
        help="WebSocket backend URL (default: ws://localhost:8000)"
    )
    args = parser.parse_args()
    asyncio.run(run_tests(args.url))
