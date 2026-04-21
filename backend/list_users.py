import os
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.databases import Databases

load_dotenv()

client = Client()
client.set_endpoint(os.getenv("APPWRITE_ENDPOINT"))
client.set_project(os.getenv("APPWRITE_PROJECT_ID"))
client.set_key(os.getenv("APPWRITE_API_KEY"))

databases = Databases(client)

def list_users():
    db_id = os.getenv("APPWRITE_DATABASE_ID")
    coll_id = "users_data"
    
    print(f"Listing all users in {coll_id}...")
    try:
        res = databases.list_documents(db_id, coll_id)
        if hasattr(res, 'documents'):
            for doc in res.documents:
                print(f"- {getattr(doc, 'username', 'N/A')} ({getattr(doc, 'email', 'N/A')}) Role: {getattr(doc, 'role', 'N/A')}")
        elif isinstance(res, dict) and 'documents' in res:
            for doc in res['documents']:
                print(f"- {doc.get('username')} ({doc.get('email')}) Role: {doc.get('role')}")
        else:
            print("No users found.")
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    list_users()
