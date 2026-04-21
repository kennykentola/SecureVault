import os
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.services.users import Users

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
users_service = Users(client)

def sync():
    coll_id = "users_data"
    print("Fetching all users from Appwrite Auth...")
    try:
        auth_users = users_service.list()
        # auth_users is likely an object with 'total' and 'users' attributes
        total = getattr(auth_users, 'total', 0) if not isinstance(auth_users, dict) else auth_users.get('total', 0)
        users_list = getattr(auth_users, 'users', []) if not isinstance(auth_users, dict) else auth_users.get('users', [])
        
        print(f"Found {total} users in Auth.")
        
        def get_attr(obj, key, default=None):
            if isinstance(obj, dict):
                return obj.get(key, default)
            return getattr(obj, key, default)

        for user in users_list:
            user_id = get_attr(user, '$id') or get_attr(user, 'id')
            email = get_attr(user, 'email')
            name = get_attr(user, 'name')
            
            print(f"Checking {name or email} ({user_id})...")
            try:
                # Check if document exists
                databases.get_document(DATABASE_ID, coll_id, user_id)
                print(f"  [OK] Profile already exists.")
            except:
                print(f"  [MISSING] Creating profile row...")
                try:
                    databases.create_document(
                        DATABASE_ID,
                        coll_id,
                        user_id,
                        {
                            "user_id": user_id,
                            "username": name or email.split('@')[0],
                            "email": email,
                            "role": "user",
                            "status": "active",
                            "public_key": ""
                        }
                    )
                    print(f"  [SUCCESS] Created row for {name or email}")
                except Exception as e:
                    print(f"  [ERROR] Failed to create row: {e}")
        
        print("\nRECOVERY SYNC COMPLETE.")
    except Exception as e:
        print(f"Sync Error: {e}")

if __name__ == "__main__":
    sync()
