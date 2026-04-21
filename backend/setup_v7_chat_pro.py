import os
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.id import ID

load_dotenv()

ENDPOINT = os.getenv("APPWRITE_ENDPOINT")
PROJECT_ID = os.getenv("APPWRITE_PROJECT_ID")
API_KEY = os.getenv("APPWRITE_API_KEY")
DATABASE_ID = os.getenv("APPWRITE_DATABASE_ID")

client = Client()
client.set_endpoint(ENDPOINT)
client.set_project(PROJECT_ID)
client.set_key(API_KEY)

databases = Databases(client)

def ensure_attribute(coll_id, attr_name, attr_type, size=5000, required=False, default=None):
    try:
        databases.get_attribute(DATABASE_ID, coll_id, attr_name)
        print(f"Attribute {attr_name} already exists in {coll_id}")
    except:
        print(f"Adding attribute {attr_name} to {coll_id}...")
        try:
            if attr_type == "string":
                databases.create_string_attribute(DATABASE_ID, coll_id, attr_name, size, required, default)
            elif attr_type == "boolean":
                databases.create_boolean_attribute(DATABASE_ID, coll_id, attr_name, required, default)
            elif attr_type == "integer":
                databases.create_integer_attribute(DATABASE_ID, coll_id, attr_name, required, min=0, default=default)
        except Exception as e:
            print(f"Failed to add {attr_name}: {e}")

def setup_v7():
    try:
        # 1. Update Messages Collection
        coll_messages = "messages"
        print(f"Upgrading {coll_messages} collection...")
        ensure_attribute(coll_messages, "is_edited", "boolean", default=False)
        ensure_attribute(coll_messages, "is_deleted", "boolean", default=False)
        ensure_attribute(coll_messages, "file_id", "string", 255) # For encrypted file attachments

        # 2. Setup Message Meta Collection
        coll_meta = "message_meta"
        try:
            databases.get_collection(DATABASE_ID, coll_meta)
            print(f"Collection {coll_meta} already exists.")
        except:
            print(f"Creating {coll_meta} collection...")
            databases.create_collection(DATABASE_ID, coll_meta, "Message Metadata", 
                                       permissions=["read(\"any\")", "create(\"users\")", "update(\"users\")"])
        
        ensure_attribute(coll_meta, "msg_id", "string", 255, required=True)
        ensure_attribute(coll_meta, "status", "string", 50, default="sent") # sent, delivered, read
        ensure_attribute(coll_meta, "updated_at", "string", 100)

        # Indexes for fast lookup
        try:
            databases.create_index(DATABASE_ID, coll_meta, "idx_msg_status", "key", ["msg_id"], ["unique"])
        except:
            pass

        # 3. Setup Statuses Collection
        coll_statuses = "statuses"
        try:
            databases.get_collection(DATABASE_ID, coll_statuses)
            print(f"Collection {coll_statuses} already exists.")
        except:
            print(f"Creating {coll_statuses} collection...")
            databases.create_collection(DATABASE_ID, coll_statuses, "User Statuses", 
                                       permissions=["read(\"any\")", "create(\"users\")", "update(\"users\")"])
        
        ensure_attribute(coll_statuses, "user_id", "string", 255, required=True)
        ensure_attribute(coll_statuses, "type", "string", 50, required=True) # text, image, video
        ensure_attribute(coll_statuses, "text_content", "string", 5000)
        ensure_attribute(coll_statuses, "content_url", "string", 255)
        ensure_attribute(coll_statuses, "background_color", "string", 50)
        ensure_attribute(coll_statuses, "caption", "string", 1000)
        ensure_attribute(coll_statuses, "created_at", "string", 100, required=True)
        ensure_attribute(coll_statuses, "expires_at", "string", 100, required=True)

        # 4. Setup Status Keys Collection (for E2EE key sharing)
        coll_status_keys = "status_keys"
        try:
            databases.get_collection(DATABASE_ID, coll_status_keys)
            print(f"Collection {coll_status_keys} already exists.")
        except:
            print(f"Creating {coll_status_keys} collection...")
            databases.create_collection(DATABASE_ID, coll_status_keys, "Status Encryption Keys", 
                                       permissions=["read(\"any\")", "create(\"users\")", "update(\"users\")"])
        
        ensure_attribute(coll_status_keys, "poster_id", "string", 255, required=True)
        ensure_attribute(coll_status_keys, "viewer_id", "string", 255, required=True)
        ensure_attribute(coll_status_keys, "encrypted_key", "string", 5000, required=True)
        ensure_attribute(coll_status_keys, "created_at", "string", 100, required=True)

        print("\nDATABASE SCHEMA V7 UPGRADE COMPLETE.")
    except Exception as e:
        print(f"Setup V7 Error: {e}")

if __name__ == "__main__":
    setup_v7()
