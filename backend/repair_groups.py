import os
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.query import Query
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

def repair():
    try:
        print("Starting Group Visibility Repair...")
        
        # 1. Fetch all groups
        groups_res = databases.list_documents(DATABASE_ID, "groups")
        groups = getattr(groups_res, "documents", [])
        
        for g in groups:
            group_id = getattr(g, "group_id", None) or getattr(g, "$id", None)
            creator_id = getattr(g, "created_by", None)
            
            if not group_id or not creator_id:
                continue
                
            # 2. Check if creator is in group_members
            members_res = databases.list_documents(DATABASE_ID, "group_members", [
                Query.equal("group_id", group_id),
                Query.equal("user_id", creator_id)
            ])
            
            if getattr(members_res, "total", 0) == 0:
                print(f"Repairing group {getattr(g, 'name', 'Unknown')} ({group_id}): Adding creator {creator_id} to members...")
                # Note: We don't have the encrypted key here, but we can add a placeholder 
                # or the user can re-create for full security. For now, adding basic membership.
                databases.create_document(DATABASE_ID, "group_members", ID.unique(), {
                    "group_id": group_id,
                    "user_id": creator_id,
                    "role": "admin",
                    "encrypted_group_key": "REPAIR_PENDING" 
                })
            else:
                print(f"Group {getattr(g, 'name', 'Unknown')} is OK.")
                
        print("\nREPAIR COMPLETE.")
    except Exception as e:
        print(f"Repair Failed: {e}")

if __name__ == "__main__":
    repair()
