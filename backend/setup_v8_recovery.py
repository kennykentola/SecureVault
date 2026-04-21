import os
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.databases import Databases

load_dotenv()

ENDPOINT = os.getenv("APPWRITE_ENDPOINT")
PROJECT_ID = os.getenv("APPWRITE_PROJECT_ID")
API_KEY = os.getenv("APPWRITE_API_KEY")
DATABASE_ID = os.getenv("APPWRITE_DATABASE_ID")
COLLECTION_USERS = os.getenv("VITE_COLLECTION_USERS") or "users_data"

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
        except Exception as e:
            print(f"Failed to add {attr_name}: {e}")

def setup_v8():
    try:
        # 1. Update Users Collection for Vault Backup
        print(f"Upgrading {COLLECTION_USERS} collection for Vault recovery...")
        ensure_attribute(COLLECTION_USERS, "vault_backup", "string", 10000)
        ensure_attribute(COLLECTION_USERS, "vault_salt", "string", 255)
        
        print("\nDATABASE SCHEMA V8 RECOVERY SETUP COMPLETE.")
    except Exception as e:
        print(f"Setup V8 Error: {e}")

if __name__ == "__main__":
    setup_v8()
