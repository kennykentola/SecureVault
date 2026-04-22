# 🛡️ Secure End-to-End Encrypted Messaging (E2EE)

A high-fidelity, production-ready messaging platform designed with a **Zero-Trust** security architecture. Built with **React**, **FastAPI**, and **Appwrite**.

## 📑 Table of Contents
1. [System Overview](#system-overview)
2. [Cryptography Model](#cryptography-model)
3. [Core Features](#core-features)
4. [Tech Stack](#tech-stack)
5. [Installation & Setup](#installation--setup)
6. [Database Schema](#database-schema)
7. [Security Hardening](#security-hardening)

---

## 🎯 System Overview
This system implements true **End-to-End Encryption (E2EE)**. Messages are encrypted on the sender's device and can only be decrypted by the intended recipient. Neither the server nor the database admins have access to the plaintext content or the private keys.

![Secure Messaging UI Mockup](C:\Users\dell\Downloads\encripting_message_chat\click_feedback_1776510904380.png)

## 🔐 Cryptography Model
Our security is based on a **Hybrid Cryptography** flow:

*   **Key Exchange (RSA-2048)**: Asymmetric encryption used to securely share session keys.
*   **Bulk Encryption (AES-256-CBC)**: Symmetric encryption used for high-performance message and file encryption.
*   **Integrity (SHA-256)**: Hashing used to verify that messages have not been tampered with.
*   **Local Vault (PIN)**: Private keys are stored in the browser's **IndexedDB**, further protected by a user-defined **6-digit PIN** (PBKDF2 derivation).

---

## ✨ Core Features
- **Real-time 1:1 Chat**: WebSocket-based instant delivery.
- **E2EE File Sharing**: Encrypt and send images, PDFs, and documents.
- **Voice Messages**: Record and transmit encrypted voice notes.
- **Crypto Visualizer**: A specialized panel to inspect the math (Plaintext, Ciphertext, Hash) of every message.
- **Admin Dashboard**: Zero-knowledge moderation (block/delete users, view stats).
- **Security PIN**:  secondary authentication for local key access.

---

## 🛠 Tech Stack
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Framer Motion.
- **Backend**: FastAPI (Python), WebSockets.
- **Infrastructure**: Appwrite (Auth, Databases, Storage).
- **Crypto**: Native Web Crypto API (Frontend), PyCryptodome (Backend).

---

## 🚀 Installation & Setup

### 1. Prerequisites
- Node.js (v20+)
- Python (v3.12+)
- Appwrite Cloud Project

### 2. Backend Initialization
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```
**Configure `.env` in `/backend`**:
```env
APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=your_project_id
APPWRITE_API_KEY=your_secret_key
APPWRITE_DATABASE_ID=your_database_id
APPWRITE_BUCKET_ID=your_bucket_id
```
**Setup Collections**:
```bash
python setup_appwrite.py
python main.py
```

### 3. Frontend Initialization
```bash
cd frontend
npm install
```
**Configure `.env` in `/frontend`**:
```env
VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=your_project_id
VITE_APPWRITE_DATABASE_ID=your_database_id
VITE_APPWRITE_BUCKET_ID=your_bucket_id
VITE_COLLECTION_USERS=your_users_collection
VITE_COLLECTION_MESSAGES=your_messages_collection
VITE_COLLECTION_REPORTS=your_reports_collection
```
**Start App**:
```bash
npm run dev
```

---

## 🗄️ Database Schema (Appwrite)
- **Users Data**: `user_id`, `username`, `email`, `public_key`, `role`, `status`.
- **Messages**: `sender_id`, `receiver_id`, `ciphertext`, `encrypted_key`, `iv`, `hash`, `timestamp`, `type`.
- **Reports**: `reporter_id`, `reported_user_id`, `reason`, `status`.

---

## 🛡️ Security Hardening
- [x] Private Keys never leave the user's browser.
- [x] All API keys are isolated in `.env` files.
- [x] Every message uses a unique random AES key/IV (Forward Secrecy).
- [x] Server manages message persistence in encrypted form only.
- [x] HMAC-based SHA-256 for integrity verification.
