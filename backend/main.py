import os
import json
import asyncio
from typing import Dict, List
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

# Initialize Appwrite Client
client = Client()
client.set_endpoint(APPWRITE_ENDPOINT)
client.set_project(APPWRITE_PROJECT_ID)
client.set_key(APPWRITE_API_KEY)
databases = Databases(client)

app = FastAPI(title="SecureVault E2EE Backend")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
                # Safe access to document ID (handles both dict and object)
                doc = res.documents[0]
                doc_id = getattr(doc, '$id', None) or doc.get('$id')
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
        await websocket.accept()
        self.active_connections[user_id] = websocket
        # Run database status update in background to not block the handshake
        asyncio.create_task(self.update_user_status(user_id, "online"))
        print(f"User {user_id} connected")

    async def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            asyncio.create_task(self.update_user_status(user_id, "offline"))
            print(f"User {user_id} disconnected")

    async def send_personal_message(self, message: dict, recipient_id: str):
        if recipient_id in self.active_connections:
            try:
                await self.active_connections[recipient_id].send_text(json.dumps(message))
                return True
            except:
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
            
            # 2. Send to all online members except sender
            for member in members_res.documents:
                member_user_id = member.get('user_id') if isinstance(member, dict) else getattr(member, 'user_id', None)
                if not member_user_id: # fallback if it's the old dict style or new object style differently
                    member_user_id = member.get('user_id') if isinstance(member, dict) else member.user_id
                if member_user_id != sender_id:
                    await self.send_personal_message(message, member_user_id)
            return True
        except Exception as e:
            print(f"Group broadcast error: {e}")
            return False

manager = ConnectionManager()

@app.get("/")
async def root():
    return {"status": "SecureVault E2EE Backend Running", "appwrite_connected": bool(APPWRITE_PROJECT_ID)}

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            print(f"Message received from {user_id}: {msg.get('type')}")
            
            # Protocol handles both naming variations
            msg_type = msg.get("type")
            recipient_id = msg.get("recipient_id") or msg.get("recipientId")
            payload = msg.get("payload")
            
            # 1. Handle Chat Messages (Direct & Group)
            if msg_type == "chat" and recipient_id and payload:
                print(f"Delivering chat from {user_id} to {recipient_id}")
                
                # Identify if recipient is a group
                is_group = False
                try:
                    databases.get_document(APPWRITE_DATABASE_ID, "groups", recipient_id)
                    is_group = True
                except:
                    pass

                # Handle Dual-Key wrapping for Sender-Access
                enc_key = payload.get("encryptedKey", "")
                enc_key_sender = payload.get("encryptedKeySender")
                
                if enc_key_sender:
                    # For 1:1 chats, we store both keys so the sender can also decrypt
                    save_key = json.dumps({
                        "encryptedKey": enc_key,
                        "encryptedKeySender": enc_key_sender
                    })
                else:
                    # For groups or old clients, store as is
                    save_key = json.dumps(enc_key) if isinstance(enc_key, dict) else enc_key

                # Map frontend packet to database schema
                db_payload = {
                    "sender_id": user_id,
                    "receiver_id": recipient_id, 
                    "ciphertext": payload.get("ciphertext", ""),
                    "encrypted_key": save_key, 
                    "iv": payload.get("iv", ""),
                    "hash": payload.get("hash", ""),
                    "timestamp": payload.get("timestamp", ""),
                    "type": payload.get("type", "text")
                }

                # Persist message to database
                try:
                    databases.create_document(
                        APPWRITE_DATABASE_ID,
                        APPWRITE_MESSAGES_COLLECTION,
                        ID.unique(),
                        db_payload,
                        permissions=[
                            Permission.read(Role.users()),
                        ]
                    )
                except Exception as e:
                    print(f"Database persistence error: {e}")

                # Deliver to recipient(s)
                delivered = False
                if is_group:
                    delivered = await manager.broadcast_to_group(msg, recipient_id, user_id)
                else:
                    delivered = await manager.send_personal_message(msg, recipient_id)
                
                # Feedback to sender about delivery success
                await manager.send_personal_message({
                    "type": "delivery_status",
                    "recipient_id": recipient_id,
                    "delivered": delivered,
                    "timestamp": payload.get("timestamp")
                }, user_id)

            # 2. Handle Message Editing
            elif msg_type == "message_edit" and recipient_id and payload:
                msg_id = msg.get("messageId")
                if msg_id:
                    try:
                        databases.update_document(APPWRITE_DATABASE_ID, APPWRITE_MESSAGES_COLLECTION, msg_id, {
                            "ciphertext": payload.get("ciphertext"),
                            "hash": payload.get("hash"),
                            "iv": payload.get("iv"),
                            "is_edited": True
                        })
                        await manager.send_personal_message(msg, recipient_id)
                    except Exception as e: print(f"Edit error: {e}")

            # 3. Handle Message Deletion
            elif msg_type == "message_delete" and recipient_id:
                msg_id = msg.get("messageId")
                delete_for_everyone = msg.get("deleteForEveryone", False)
                if msg_id:
                    try:
                        if delete_for_everyone:
                            databases.update_document(APPWRITE_DATABASE_ID, APPWRITE_MESSAGES_COLLECTION, msg_id, {
                                "is_deleted": True,
                                "ciphertext": "", 
                                "hash": ""
                            })
                        await manager.send_personal_message(msg, recipient_id)
                    except Exception as e: print(f"Delete error: {e}")

            # 4. Handle Typing Status Updates
            elif msg_type == "typing" and recipient_id:
                await manager.send_personal_message(msg, recipient_id)

            # 5. Handle Status Updates (read/delivered acknowledgements)
            elif msg_type == "status_update" and recipient_id:
                await manager.send_personal_message(msg, recipient_id)
                
                msg_id = msg.get("messageId")
                if msg_id:
                    try:
                        meta_res = databases.list_documents(APPWRITE_DATABASE_ID, "message_meta", [Query.equal("msg_id", msg_id)])
                        update_data = {"status": msg.get("status"), "updated_at": payload.get("timestamp") if payload else None}
                        if meta_res.documents:
                            doc = meta_res.documents[0]
                            doc_id = getattr(doc, '$id', None) or doc.get('$id')
                            if doc_id:
                                databases.update_document(APPWRITE_DATABASE_ID, "message_meta", doc_id, update_data)
                        else:
                            databases.create_document(APPWRITE_DATABASE_ID, "message_meta", ID.unique(), {"msg_id": msg_id, **update_data})
                    except Exception as e:
                        print(f"Meta update error: {e}")

            # 6. Handle WebRTC Signaling (Video/Voice calls)
            elif msg_type in ["offer", "answer", "candidate"] and recipient_id:
                await manager.send_personal_message(msg, recipient_id)

    except WebSocketDisconnect:
        await manager.disconnect(user_id)
    except Exception as e:
        print(f"WebSocket execution error: {e}")
        await manager.disconnect(user_id)

if __name__ == "__main__":
    import uvicorn
    # Startup on all interfaces to ensure internal and external accessibility
    uvicorn.run(app, host="0.0.0.0", port=8000)
