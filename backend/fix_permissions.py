import os
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.permission import Permission
from appwrite.role import Role

def repair_permissions():
    load_dotenv()
    
    client = Client()
    client.set_endpoint(os.getenv('APPWRITE_ENDPOINT'))
    client.set_project(os.getenv('APPWRITE_PROJECT_ID'))
    client.set_key(os.getenv('APPWRITE_API_KEY'))
    
    databases = Databases(client)
    db_id = os.getenv('APPWRITE_DATABASE_ID')
    col_id = 'messages'
    
    print(f"Fetching messages from collection: {col_id}...")
    
    try:
        # Get documents (using attribute access for Appwrite SDK result)
        result = databases.list_documents(db_id, col_id)
        docs = result.documents
        print(f"Found {len(docs)} messages to repair.")
        
        for doc in docs:
            print(f"Repairing permissions for message: {doc['$id']}...")
            databases.update_document(
                db_id,
                col_id,
                doc['$id'],
                permissions=[
                    Permission.read(Role.users()),
                ]
            )
        
        print("DONE: All messages repaired successfully!")
    except Exception as e:
        print(f"ERROR during repair: {e}")

if __name__ == "__main__":
    repair_permissions()
