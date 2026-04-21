import os
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.storage import Storage

load_dotenv()

ENDPOINT = os.getenv("APPWRITE_ENDPOINT")
PROJECT_ID = os.getenv("APPWRITE_PROJECT_ID")
API_KEY = os.getenv("APPWRITE_API_KEY")
BUCKET_ID = os.getenv("APPWRITE_BUCKET_ID") or "e2eemessaging"

client = Client()
client.set_endpoint(ENDPOINT)
client.set_project(PROJECT_ID)
client.set_key(API_KEY)

storage = Storage(client)

def fix_storage_permissions():
    print(f"Fixing permissions for bucket: {BUCKET_ID}")
    try:
        # Check if bucket exists
        bucket = storage.get_bucket(BUCKET_ID)
        print(f"Bucket found: {bucket.name}")
        
        # Update permissions to allow users to create and read
        # permissions=["read(\"any\")", "create(\"users\")", "update(\"users\")", "delete(\"users\")"]
        storage.update_bucket(
            BUCKET_ID,
            bucket.name,
            permissions=["read(\"any\")", "create(\"users\")", "update(\"users\")", "delete(\"users\")"],
            file_security=True,
            enabled=True
        )
        print("Bucket permissions updated successfully!")
    except Exception as e:
        print(f"Failed to fix bucket permissions: {e}")
        print("Attempting to create bucket if it doesn't exist...")
        try:
             storage.create_bucket(
                BUCKET_ID,
                "SecureVault Storage",
                permissions=["read(\"any\")", "create(\"users\")", "update(\"users\")", "delete(\"users\")"],
                file_security=True
            )
             print("Bucket created with correct permissions!")
        except Exception as e2:
             print(f"Could not create bucket: {e2}")

if __name__ == "__main__":
    fix_storage_permissions()
