import os
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.databases import Databases

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
        # 1. Users Data Collection
        coll_id = "users_data"
        print(f"Checking for {coll_id} collection...")
        try:
            databases.get_collection(DATABASE_ID, coll_id)
        except:
            print(f"Creating {coll_id} collection...")
            databases.create_collection(DATABASE_ID, coll_id, "Users Profiles", 
                                       permissions=["read(\"any\")", "create(\"users\")", "update(\"users\")"])
        
        # Attributes from USER prompt
        ensure_attribute(coll_id, "user_id", "string", 255, required=True)
        ensure_attribute(coll_id, "username", "string", 255)
        ensure_attribute(coll_id, "email", "string", 255)
        ensure_attribute(coll_id, "public_key", "string", 5000, required=False, default="")
        ensure_attribute(coll_id, "role", "string", 50, default="user")
        ensure_attribute(coll_id, "status", "string", 50, default="active")
        ensure_attribute(coll_id, "bio", "string", 1000)
        ensure_attribute(coll_id, "avatar_id", "string", 255)

        # 2. Update existing collection permissions just in case
        print("Updating permissions for users_data, messages, reports...")
        collections = {
            "users_data": ["read(\"any\")", "create(\"users\")", "update(\"users\")"],
            "messages": ["read(\"users\")", "create(\"users\")", "update(\"users\")"],
            "reports": ["create(\"users\")", "read(\"users\")"]
        }
        for c_id, perms in collections.items():
            try:
                databases.update_collection(DATABASE_ID, c_id, c_id.capitalize(), permissions=perms)
                print(f"Permissions fixed for {c_id}")
            except:
                pass

        print("\nSETUP COMPLETE. Future registrations will now appear in the database.")
    except Exception as e:
        print(f"Critical Setup Error: {e}")

if __name__ == "__main__":
    setup()
