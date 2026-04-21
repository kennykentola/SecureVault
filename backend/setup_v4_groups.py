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
        # 1. Groups Collection
        coll_groups = "groups"
        try:
            databases.get_collection(DATABASE_ID, coll_groups)
        except:
            print(f"Creating {coll_groups} collection...")
            databases.create_collection(DATABASE_ID, coll_groups, "Chat Groups", 
                                       permissions=["read(\"any\")", "create(\"users\")", "update(\"users\")"])
        
        ensure_attribute(coll_groups, "name", "string", 255, required=True)
        ensure_attribute(coll_groups, "description", "string", 1000)
        ensure_attribute(coll_groups, "avatar_id", "string", 255)
        ensure_attribute(coll_groups, "created_by", "string", 255)
        ensure_attribute(coll_groups, "group_id", "string", 255)

        # 2. Group Members Collection
        coll_members = "group_members"
        try:
            databases.get_collection(DATABASE_ID, coll_members)
        except:
            print(f"Creating {coll_members} collection...")
            databases.create_collection(DATABASE_ID, coll_members, "Group Memberships", 
                                       permissions=["read(\"any\")", "create(\"users\")", "update(\"users\")"])
        
        ensure_attribute(coll_members, "group_id", "string", 255, required=True)
        ensure_attribute(coll_members, "user_id", "string", 255, required=True)
        ensure_attribute(coll_members, "encrypted_group_key", "string", 5000)
        ensure_attribute(coll_members, "role", "string", 50, default="member")

        print("\nGROUP SYSTEM SETUP COMPLETE.")
    except Exception as e:
        print(f"Setup Error: {e}")

if __name__ == "__main__":
    setup()
