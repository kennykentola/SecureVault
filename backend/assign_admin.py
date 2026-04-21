import os
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.query import Query

load_dotenv()

client = Client()
client.set_endpoint(os.getenv("APPWRITE_ENDPOINT"))
client.set_project(os.getenv("APPWRITE_PROJECT_ID"))
client.set_key(os.getenv("APPWRITE_API_KEY"))

databases = Databases(client)

def assign_admin():
    email = "peterkehindeademola@gmail.com"
    db_id = os.getenv("APPWRITE_DATABASE_ID")
    coll_id = "users_data"
    
    print(f"Searching for user: {email}...")
    try:
        res = databases.list_documents(db_id, coll_id, [Query.equal("email", email)])
        
        # Accessing as object attributes (newer SDK)
        if hasattr(res, 'total') and res.total > 0:
            doc = res.documents[0]
            doc_id = doc.get('$id') if isinstance(doc, dict) else getattr(doc, '$id', None)
            if not doc_id:
                # Some versions use 'id' or other variants
                doc_id = doc.get('id') if isinstance(doc, dict) else getattr(doc, 'id', None)
            
            if doc_id:
                databases.update_document(db_id, coll_id, doc_id, {"role": "admin"})
                print(f"SUCCESS: {email} (ID: {doc_id}) is now an ADMIN.")
            else:
                print("ERROR: Could not find document ID field.")
        # Accessing as dict (older SDK)
        elif isinstance(res, dict) and res.get('total', 0) > 0:
            doc_id = res['documents'][0]['$id']
            databases.update_document(db_id, coll_id, doc_id, {"role": "admin"})
            print(f"SUCCESS: {email} is now an ADMIN.")
        else:
            print(f"ERROR: User {email} not found.")
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    assign_admin()
