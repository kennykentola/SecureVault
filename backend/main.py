import os
import json
import asyncio
from typing import Any, Dict, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.query import Query
from appwrite.id import ID
from appwrite.permission import Permission
from appwrite.role import Role

# Load environment variables
load_dotenv()

APPWRITE_ENDPOINT = os.getenv("APPWRITE_ENDPOINT")
APPWRITE_PROJECT_ID = os.getenv("APPWRITE_PROJECT_ID")
APPWRITE_API_KEY = os.getenv("APPWRITE_API_KEY")
APPWRITE_DATABASE_ID = os.getenv("APPWRITE_DATABASE_ID")
APPWRITE_MESSAGES_COLLECTION = "messages"

print("\n--- SERVER INITIALIZATION ---")
print(f"Endpoint: {APPWRITE_ENDPOINT}")
print(f"Project ID: {APPWRITE_PROJECT_ID}")
print(f"Database ID: {APPWRITE_DATABASE_ID}")
print(f"API Key present: {bool(APPWRITE_API_KEY)}")

if not all([APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY]):
    print("CRITICAL: Missing Appwrite configuration. Check your environment variables.")

# Initialize Appwrite Client
try:
    client = Client()
    client.set_endpoint(APPWRITE_ENDPOINT)
    client.set_project(APPWRITE_PROJECT_ID)
    client.set_key(APPWRITE_API_KEY)
    databases = Databases(client)
    print("Appwrite Client initialized successfully.")
except Exception as e:
    print(f"Appwrite Client initialization failed: {e}")


def get_value(source: Any, *keys: str):
    if isinstance(source, dict):
        for key in keys:
            value = source.get(key)
            if value is not None:
                return value
        return None

    for key in keys:
        value = getattr(source, key, None)
        if value is not None:
            return value
    return None


def get_document_id(document: Any) -> Optional[str]:
    return get_value(document, "$id", "id")


def get_recipient_id(message: dict) -> Optional[str]:
    return message.get("recipient_id") or message.get("recipientId")


def get_group_id(message: dict) -> Optional[str]:
    return message.get("group_id") or message.get("groupId")


def build_outbound_message(
    message: dict,
    sender_id: str,
    recipient_id: Optional[str] = None,
    message_id: Optional[str] = None,
    is_group: Optional[bool] = None,
) -> dict:
    outbound = dict(message)
    outbound["sender_id"] = sender_id

    normalized_recipient = recipient_id or get_recipient_id(outbound)
    if normalized_recipient:
        outbound["recipient_id"] = normalized_recipient
        outbound["recipientId"] = normalized_recipient

    if message_id:
        outbound["$id"] = message_id
        outbound.setdefault("messageId", message_id)

    if is_group is not None:
        outbound["is_group"] = is_group

    return outbound


def recipient_is_group(message: dict, recipient_id: Optional[str]) -> bool:
    if isinstance(message.get("is_group"), bool):
        return message["is_group"]

    if not recipient_id:
        return False

    if recipient_id.startswith("group:"):
        return True

    try:
        databases.get_document(APPWRITE_DATABASE_ID, "groups", recipient_id)
        return True
    except Exception:
        return False


def normalize_direct_recipient_id(recipient_id: Optional[str]) -> Optional[str]:
    if not recipient_id:
        return recipient_id

    try:
        res = databases.list_documents(
            APPWRITE_DATABASE_ID,
            "users_data",
            [Query.equal("user_id", recipient_id), Query.limit(1)]
        )
        if res.documents:
            return recipient_id
    except Exception:
        pass

    try:
        profile = databases.get_document(APPWRITE_DATABASE_ID, "users_data", recipient_id)
        canonical_user_id = get_value(profile, "user_id")
        if canonical_user_id:
            print(f"[WS Notice] Normalized profile recipient {recipient_id} -> {canonical_user_id}")
            return canonical_user_id
    except Exception:
        pass

    return recipient_id


def build_message_payloads(user_id: str, recipient_id: str, payload: dict, save_key: str, is_group: bool):
    legacy_payload = {
        "sender_id": user_id,
        "receiver_id": recipient_id,
        "ciphertext": payload.get("ciphertext", ""),
        "encrypted_key": save_key,
        "iv": payload.get("iv", ""),
        "hash": payload.get("hash", ""),
        "timestamp": payload.get("timestamp", ""),
        "type": payload.get("type", "text"),
    }

    extended_payload = dict(legacy_payload)
    extended_payload["group_id"] = recipient_id if is_group else ""
    extended_payload["sender_name"] = payload.get("sender_name", "")
    try:
        extended_payload["payload"] = json.dumps(payload)
    except Exception:
        extended_payload["payload"] = ""

    return extended_payload, legacy_payload


def persist_message_document(primary_payload: dict, fallback_payload: dict):
    try:
        return databases.create_document(
            APPWRITE_DATABASE_ID,
            APPWRITE_MESSAGES_COLLECTION,
            ID.unique(),
            primary_payload,
            permissions=[Permission.read(Role.users())]
        )
    except Exception as primary_error:
        print(f"[WS DB Error] Primary persistence failed: {primary_error}")

        if primary_payload == fallback_payload:
            return None

        try:
            saved_message = databases.create_document(
                APPWRITE_DATABASE_ID,
                APPWRITE_MESSAGES_COLLECTION,
                ID.unique(),
                fallback_payload,
                permissions=[Permission.read(Role.users())]
            )
            print("[WS DB Notice] Message persisted using legacy schema fallback.")
            return saved_message
        except Exception as fallback_error:
            print(f"[WS DB Error] Legacy persistence failed: {fallback_error}")
            return None

app = FastAPI(title="SecureVault E2EE Backend")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health Check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "appwrite_configured": all([APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID]),
        "active_connections": len(manager.active_connections)
    }

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def update_user_status(self, user_id: str, status: str):
        try:
            # Find the document ID for this user_id in the profiles collection
            res = databases.list_documents(
                APPWRITE_DATABASE_ID,
                "users_data",
                [Query.equal("user_id", user_id)]
            )
            if res.documents:
                doc = res.documents[0]
                # Appwrite SDK can return dict or Document object depending on version
                doc_id = None
                if isinstance(doc, dict):
                    doc_id = doc.get('$id')
                else:
                    doc_id = getattr(doc, '$id', None) or getattr(doc, 'id', None)
                
                if doc_id:
                    databases.update_document(
                        APPWRITE_DATABASE_ID,
                        "users_data",
                        doc_id,
                        {"status": status}
                    )
                    print(f"User {user_id} is now {status}")
        except Exception as e:
            print(f"Failed to update status for {user_id}: {e}")

    async def connect(self, user_id: str, websocket: WebSocket):
        existing = self.active_connections.get(user_id)
        if existing and existing is not websocket:
            try:
                await existing.close(code=1000)
            except Exception:
                pass

        await websocket.accept()
        self.active_connections[user_id] = websocket
        # Run database status update in background to not block the handshake
        asyncio.create_task(self.update_user_status(user_id, "online"))
        print(f"User {user_id} connected")

    async def disconnect(self, user_id: str, websocket: Optional[WebSocket] = None):
        current = self.active_connections.get(user_id)
        if not current:
            return

        if websocket is not None and current is not websocket:
            return

        del self.active_connections[user_id]
        asyncio.create_task(self.update_user_status(user_id, "offline"))
        print(f"User {user_id} disconnected")

    async def send_personal_message(self, message: dict, recipient_id: str):
        connection = self.active_connections.get(recipient_id)
        if not connection:
            return False

        try:
            await connection.send_text(json.dumps(message))
            return True
        except Exception as e:
            print(f"[WS Send Error] Failed to deliver to {recipient_id}: {e}")
            await self.disconnect(recipient_id, connection)
            try:
                await connection.close(code=1011)
            except Exception:
                pass
            return False
        return False

    async def broadcast_to_group(self, message: dict, group_id: str, sender_id: str):
        try:
            # 1. Get all members of the group from group_members collection
            members_res = databases.list_documents(
                APPWRITE_DATABASE_ID,
                "group_members",
                [Query.equal("group_id", group_id)]
            )
            
            delivered = False

            # 2. Send to all online members except sender
            for member in members_res.documents:
                member_user_id = get_value(member, "user_id")
                
                if member_user_id and member_user_id != sender_id:
                    delivered = await self.send_personal_message(message, member_user_id) or delivered
            return delivered
        except Exception as e:
            print(f"Group broadcast error: {e}")
            return False

manager = ConnectionManager()

@app.get("/")
async def root():
    return {"status": "SecureVault E2EE Backend Running", "appwrite_connected": bool(APPWRITE_PROJECT_ID)}

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    print(f"\n[WS Handshake] Attempt for user: {user_id}")
    try:
        await manager.connect(user_id, websocket)
        print(f"[WS Status] Connection accepted for {user_id}")
        
        while True:
            try:
                data = await websocket.receive_text()
                if not data:
                    continue
                    
                msg = json.loads(data)
                msg_type = msg.get("type")
                
                # Handle Keep-Alive Ping
                if msg_type == "ping":
                    await websocket.send_text(json.dumps({"type": "pong", "timestamp": msg.get("timestamp")}))
                    continue

                print(f"[WS Inbound] {user_id}: {msg_type}")
                
                recipient_id = get_recipient_id(msg)
                payload = msg.get("payload")
                
                # 1. Handle Chat Messages (Direct & Group)
                if msg_type == "chat" and recipient_id and isinstance(payload, dict):
                    is_group = recipient_is_group(msg, recipient_id)
                    if not is_group:
                        recipient_id = normalize_direct_recipient_id(recipient_id)

                    # Handle Dual-Key wrapping for Sender-Access
                    enc_key = payload.get("encryptedKey", "")
                    enc_key_sender = payload.get("encryptedKeySender")
                    
                    if enc_key_sender:
                        save_key = json.dumps({
                            "encryptedKey": enc_key,
                            "encryptedKeySender": enc_key_sender
                        })
                    else:
                        save_key = json.dumps(enc_key) if isinstance(enc_key, dict) else enc_key

                    primary_payload, fallback_payload = build_message_payloads(
                        user_id,
                        recipient_id,
                        payload,
                        save_key,
                        is_group,
                    )

                    # Persist message to database
                    saved_message_id = msg.get("tempId")
                    saved_message = persist_message_document(primary_payload, fallback_payload)
                    saved_message_id = get_document_id(saved_message) or saved_message_id

                    outbound = build_outbound_message(
                        msg,
                        sender_id=user_id,
                        recipient_id=recipient_id,
                        message_id=saved_message_id,
                        is_group=is_group,
                    )

                    # Deliver
                    delivered = False
                    if is_group:
                        delivered = await manager.broadcast_to_group(outbound, recipient_id, user_id)
                    else:
                        delivered = await manager.send_personal_message(outbound, recipient_id)
                    
                    # Feedback to sender
                    await manager.send_personal_message({
                        "type": "delivery_status",
                        "recipient_id": recipient_id,
                        "recipientId": recipient_id,
                        "clientTempId": msg.get("tempId"),
                        "messageId": saved_message_id,
                        "delivered": delivered,
                        "timestamp": payload.get("timestamp")
                    }, user_id)

                # 2. Handle Message Editing
                elif msg_type == "message_edit" and recipient_id and isinstance(payload, dict):
                    msg_id = msg.get("messageId")
                    if msg_id:
                        try:
                            if not recipient_is_group(msg, recipient_id):
                                recipient_id = normalize_direct_recipient_id(recipient_id)
                            update_data = {
                                "ciphertext": payload.get("ciphertext"),
                                "hash": payload.get("hash"),
                                "iv": payload.get("iv"),
                                "is_edited": True
                            }
                            try:
                                databases.update_document(
                                    APPWRITE_DATABASE_ID,
                                    APPWRITE_MESSAGES_COLLECTION,
                                    msg_id,
                                    {**update_data, "payload": json.dumps(payload)}
                                )
                            except Exception as payload_update_error:
                                print(f"[WS Edit Notice] Payload update unavailable, falling back to legacy fields: {payload_update_error}")
                                databases.update_document(
                                    APPWRITE_DATABASE_ID,
                                    APPWRITE_MESSAGES_COLLECTION,
                                    msg_id,
                                    update_data
                                )
                            outbound = build_outbound_message(
                                msg,
                                sender_id=user_id,
                                recipient_id=recipient_id,
                                message_id=msg_id,
                                is_group=recipient_is_group(msg, recipient_id),
                            )
                            if outbound.get("is_group"):
                                await manager.broadcast_to_group(outbound, recipient_id, user_id)
                            else:
                                await manager.send_personal_message(outbound, recipient_id)
                        except Exception as e: print(f"[WS Edit Error] {e}")

                # 3. Handle Message Deletion
                elif msg_type == "message_delete" and recipient_id:
                    msg_id = msg.get("messageId")
                    delete_for_everyone = msg.get("deleteForEveryone", False)
                    if msg_id:
                        try:
                            if not recipient_is_group(msg, recipient_id):
                                recipient_id = normalize_direct_recipient_id(recipient_id)
                            if delete_for_everyone:
                                databases.update_document(APPWRITE_DATABASE_ID, APPWRITE_MESSAGES_COLLECTION, msg_id, {
                                    "is_deleted": True,
                                    "ciphertext": "", 
                                    "hash": ""
                                })
                            outbound = build_outbound_message(
                                msg,
                                sender_id=user_id,
                                recipient_id=recipient_id,
                                message_id=msg_id,
                                is_group=recipient_is_group(msg, recipient_id),
                            )
                            if outbound.get("is_group"):
                                await manager.broadcast_to_group(outbound, recipient_id, user_id)
                            else:
                                await manager.send_personal_message(outbound, recipient_id)
                        except Exception as e: print(f"[WS Delete Error] {e}")

                # 4-6. Other signals (Typing, Status, WebRTC)
                elif msg_type == "key_sync_request":
                    group_id = get_group_id(msg) or recipient_id
                    if group_id:
                        outbound = build_outbound_message(
                            msg,
                            sender_id=user_id,
                            recipient_id=group_id,
                            is_group=True,
                        )
                        await manager.broadcast_to_group(outbound, group_id, user_id)
                elif msg_type in ["typing", "status_update", "offer", "answer", "candidate", "reaction", "key_sync_delivery"] and recipient_id:
                    recipient_id = normalize_direct_recipient_id(recipient_id)
                    outbound = build_outbound_message(msg, sender_id=user_id, recipient_id=recipient_id)
                    await manager.send_personal_message(outbound, recipient_id)
                else:
                    print(f"[WS Notice] Ignored unsupported payload from {user_id}: {msg_type}")

            except WebSocketDisconnect:
                raise
            except json.JSONDecodeError:
                print(f"[WS Protocol Error] Invalid JSON from {user_id}")
            except Exception as e:
                print(f"[WS Loop Error] {user_id}: {e}")
                try:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "code": "message_processing_failed"
                    }))
                except Exception:
                    pass
                continue

    except WebSocketDisconnect:
        print(f"[WS Status] Disconnected: {user_id}")
    except Exception as e:
        print(f"[WS Critical Error] Handshake/Connection failed for {user_id}: {e}")
    finally:
        try:
            await manager.disconnect(user_id, websocket)
        except Exception:
            pass

if __name__ == "__main__":
    import uvicorn
    # Render and other cloud providers inject the port via the PORT environment variable
    port = int(os.getenv("PORT", 8000))
    print(f"Starting server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
