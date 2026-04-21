import os
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.databases import Databases

# Load environment variables
load_dotenv()

# Appwrite Configurations
ENDPOINT = os.getenv("APPWRITE_ENDPOINT")
PROJECT_ID = os.getenv("APPWRITE_PROJECT_ID")
API_KEY = os.getenv("APPWRITE_API_KEY") 
DATABASE_ID = os.getenv("APPWRITE_DATABASE_ID")

client = Client()
client.set_endpoint(ENDPOINT)
client.set_project(PROJECT_ID)
client.set_key(API_KEY)

databases = Databases(client)

def ensure_attribute(coll_id, attr_name, attr_type, size=255, required=False, default=None):
    try:
        databases.get_attribute(DATABASE_ID, coll_id, attr_name)
    except:
        print(f"Adding attribute {attr_name} to {coll_id}...")
        try:
            if attr_type == "string":
                databases.create_string_attribute(DATABASE_ID, coll_id, attr_name, size, required, default)
            elif attr_type == "boolean":
                databases.create_boolean_attribute(DATABASE_ID, coll_id, attr_name, required, default)
        except Exception as e:
            print(f"Failed to add {attr_name}: {e}")

def setup():
    try:
        # Sidecar Meta Collection
        meta_id = "message_meta"
        print(f"Checking for {meta_id}...")
        try:
            databases.get_collection(DATABASE_ID, meta_id)
        except:
            print(f"Creating {meta_id} collection...")
            databases.create_collection(DATABASE_ID, meta_id, "Message Metadata", permissions=["read(\"any\")", "create(\"users\")", "update(\"users\")"])
        
        ensure_attribute(meta_id, "msg_id", "string", 255, required=True)
        ensure_attribute(meta_id, "status", "string", 20, default="sent")
        ensure_attribute(meta_id, "reactions", "string", 2000)
        ensure_attribute(meta_id, "parent_id", "string", 255)
        
        # Messages Collection Updates
        coll_messages = "messages"
        ensure_attribute(coll_messages, "encrypted_key_sender", "string", 1000)
        
        print("Elite Schema Update (Phase 2 SC) Done.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    setup()

    # Add phone attribute to users_data
    ensure_attribute("users_data", "phone", "string", 20)
    print("Database updated with 'phone' attribute.")
