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

def ensure_attribute(coll_id, attr_name, attr_type, size=5000, required=False, default=None, array=False):
    try:
        databases.get_attribute(DATABASE_ID, coll_id, attr_name)
        print(f"Attribute {attr_name} already exists in {coll_id}")
    except:
        print(f"Adding attribute {attr_name} to {coll_id}...")
        try:
            if attr_type == "string":
                databases.create_string_attribute(DATABASE_ID, coll_id, attr_name, size, required, default, array=array)
            elif attr_type == "boolean":
                databases.create_boolean_attribute(DATABASE_ID, coll_id, attr_name, required, default)
            elif attr_type == "integer":
                databases.create_integer_attribute(DATABASE_ID, coll_id, attr_name, required, min=0, default=default)
        except Exception as e:
            print(f"Failed to add {attr_name}: {e}")

def setup_v6():
    try:
        # 1. Statuses Collection
        coll_statuses = "statuses"
        try:
            databases.get_collection(DATABASE_ID, coll_statuses)
            print(f"Collection {coll_statuses} already exists.")
        except:
            print(f"Creating {coll_statuses} collection...")
            databases.create_collection(DATABASE_ID, coll_statuses, "User Status Updates", 
                                       permissions=["read(\"users\")", "create(\"users\")", "update(\"users\")"])
        
        ensure_attribute(coll_statuses, "user_id", "string", 255, required=True)
        ensure_attribute(coll_statuses, "type", "string", 20, required=True) # text, image, video
        ensure_attribute(coll_statuses, "content_url", "string", 255) # File ID for media
        ensure_attribute(coll_statuses, "text_content", "string", 10000) # Encrypted JSON for text/styles
        ensure_attribute(coll_statuses, "background_color", "string", 50)
        ensure_attribute(coll_statuses, "caption", "string", 1000) # Encrypted
        ensure_attribute(coll_statuses, "created_at", "string", 100)
        ensure_attribute(coll_statuses, "expires_at", "string", 100)
        ensure_attribute(coll_statuses, "viewers", "string", 255, array=True)
        ensure_attribute(coll_statuses, "excluded_users", "string", 255, array=True)

        # 2. Status Keys Collection (For symmetric key sharing)
        coll_keys = "status_keys"
        try:
            databases.get_collection(DATABASE_ID, coll_keys)
            print(f"Collection {coll_keys} already exists.")
        except:
            print(f"Creating {coll_keys} collection...")
            databases.create_collection(DATABASE_ID, coll_keys, "Shared Status Keys", 
                                       permissions=["read(\"users\")", "create(\"users\")", "update(\"users\")"])
        
        ensure_attribute(coll_keys, "owner_id", "string", 255, required=True) # Who posted the status
        ensure_attribute(coll_keys, "recipient_id", "string", 255, required=True) # Who can view it
        ensure_attribute(coll_keys, "encrypted_key", "string", 5000, required=True) # RSA Encrypted SSK
        ensure_attribute(coll_keys, "updated_at", "string", 100)

        print("\nDATABASE SCHEMA V6 (STATUS) SETUP COMPLETE.")
    except Exception as e:
        print(f"Setup V6 Error: {e}")

if __name__ == "__main__":
    setup_v6()
