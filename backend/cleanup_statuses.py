import os
import time
from datetime import datetime
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.services.storage import Storage
from appwrite.query import Query

load_dotenv()

ENDPOINT = os.getenv("APPWRITE_ENDPOINT")
PROJECT_ID = os.getenv("APPWRITE_PROJECT_ID")
API_KEY = os.getenv("APPWRITE_API_KEY")
DATABASE_ID = os.getenv("APPWRITE_DATABASE_ID")
BUCKET_ID = os.getenv("APPWRITE_BUCKET_ID") or "default"

client = Client()
client.set_endpoint(ENDPOINT)
client.set_project(PROJECT_ID)
client.set_key(API_KEY)

databases = Databases(client)
storage = Storage(client)

def cleanup_expired_statuses():
    now = datetime.utcnow().isoformat()
    print(f"[{datetime.now()}] Starting cleanup of expired statuses (older than {now})...")
    
    try:
        # Query expired statuses
        res = databases.list_documents(DATABASE_ID, "statuses", [
            Query.less_than("expires_at", now),
            Query.limit(100)
        ])
        
        count = 0
        for doc in res.documents:
            status_id = doc.id
            file_id = getattr(doc, 'content_url', None)
            
            # 1. Delete media file if exists
            if file_id and file_id != "":
                try:
                    storage.delete_file(BUCKET_ID, file_id)
                    print(f"Deleted storage file: {file_id}")
                except Exception as e:
                    print(f"Failed to delete file {file_id}: {e}")
            
            # 2. Delete status document
            try:
                databases.delete_document(DATABASE_ID, "statuses", status_id)
                print(f"Deleted status document: {status_id}")
                count += 1
            except Exception as e:
                print(f"Failed to delete document {status_id}: {e}")
        
        print(f"[{datetime.now()}] Cleanup complete. Total deleted: {count}")
    except Exception as e:
        print(f"Cleanup Error: {e}")

if __name__ == "__main__":
    cleanup_expired_statuses()
