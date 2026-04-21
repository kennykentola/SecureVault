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

def setup_v5():
    try:
        # 1. Groups Collection Updates
        coll_groups = "groups"
        print(f"Checking {coll_groups} collection...")
        ensure_attribute(coll_groups, "avatar_url", "string", 1000)
        ensure_attribute(coll_groups, "created_at", "string", 100)

        # 2. Group Members Collection Updates
        coll_members = "group_members"
        print(f"Checking {coll_members} collection...")
        ensure_attribute(coll_members, "joined_at", "string", 100)

        # 3. Group Media Collection (NEW)
        coll_media = "group_media"
        try:
            databases.get_collection(DATABASE_ID, coll_media)
            print(f"Collection {coll_media} already exists.")
        except:
            print(f"Creating {coll_media} collection...")
            databases.create_collection(DATABASE_ID, coll_media, "Group Shared Media", 
                                       permissions=["read(\"users\")", "create(\"users\")", "update(\"users\")"])
        
        ensure_attribute(coll_media, "group_id", "string", 255, required=True)
        ensure_attribute(coll_media, "file_id", "string", 255, required=True)
        ensure_attribute(coll_media, "file_name", "string", 500)
        ensure_attribute(coll_media, "file_type", "string", 50) # image, video, document, link
        ensure_attribute(coll_media, "file_size", "integer")
        ensure_attribute(coll_media, "sender_id", "string", 255)
        ensure_attribute(coll_media, "timestamp", "string", 100)

        # 4. Reports Collection Updates
        coll_reports = "reports"
        print(f"Checking {coll_reports} collection...")
        ensure_attribute(coll_reports, "group_id", "string", 255)

        # 5. Messages Collection Updates (Ensure recipient_id can be a group)
        coll_messages = "messages"
        print(f"Checking {coll_messages} collection...")
        ensure_attribute(coll_messages, "group_id", "string", 255) # For explicit grouping if needed

        # 6. Reactions Collection (NEW)
        coll_reactions = "reactions"
        try:
            databases.get_collection(DATABASE_ID, coll_reactions)
        except:
            print(f"Creating {coll_reactions} collection...")
            databases.create_collection(DATABASE_ID, coll_reactions, "Message Reactions",
                                       permissions=["read(\"users\")", "create(\"users\")", "update(\"users\")"])
        
        ensure_attribute(coll_reactions, "message_id", "string", 255, required=True)
        ensure_attribute(coll_reactions, "user_id", "string", 255, required=True)
        ensure_attribute(coll_reactions, "emoji", "string", 10, required=True)
        ensure_attribute(coll_reactions, "timestamp", "string", 100)

        print("\nDATABASE SCHEMA V5 SETUP COMPLETE.")
    except Exception as e:
        print(f"Setup V5 Error: {e}")

if __name__ == "__main__":
    setup_v5()
