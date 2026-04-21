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
        print(f"Attribute '{attr_name}' already exists in '{coll_id}'")
    except:
        print(f"Adding attribute '{attr_name}' to '{coll_id}'...")
        try:
            if attr_type == "string":
                databases.create_string_attribute(DATABASE_ID, coll_id, attr_name, size, required, default)
            elif attr_type == "boolean":
                databases.create_boolean_attribute(DATABASE_ID, coll_id, attr_name, required, default)
            elif attr_type == "integer":
                databases.create_integer_attribute(DATABASE_ID, coll_id, attr_name, required, min=0, default=default)
            print(f"   Successfully added '{attr_name}'")
        except Exception as e:
            print(f"   Failed to add '{attr_name}': {e}")

def ensure_index(coll_id, index_name, index_type, attributes):
    try:
        # Check if index exists by listing and searching
        results = databases.list_indexes(DATABASE_ID, coll_id)
        if any(idx.key == index_name for idx in results.indexes):
            print(f"Index '{index_name}' already exists in '{coll_id}'")
            return
        
        print(f"Creating index '{index_name}' ({index_type}) on {attributes} in '{coll_id}'...")
        databases.create_index(DATABASE_ID, coll_id, index_name, index_type, attributes)
        print(f"   Successfully created '{index_name}'")
    except Exception as e:
        print(f"   Failed to create index '{index_name}': {e}")

def setup_v10():
    print("--- STARTING SCHEMA ALIGNMENT (V10) ---")
    
    # 1. FIX MESSAGES COLLECTION
    coll_messages = "messages"
    print(f"\nAligning '{coll_messages}' collection...")
    # Use smaller sizes to stay within row size limit
    ensure_attribute(coll_messages, "group_id", "string", 36)
    ensure_attribute(coll_messages, "sender_name", "string", 100)
    ensure_attribute(coll_messages, "encrypted_key", "string", 1000) # RSA ciphertext is < 1000
    
    # 2. FIX USERS_DATA COLLECTION & SEARCH INDEXES
    coll_users = "users_data"
    print(f"\nAligning '{coll_users}' collection...")
    ensure_attribute(coll_users, "phone", "string", 20)
    ensure_attribute(coll_users, "public_key", "string", 4000)
    ensure_attribute(coll_users, "username", "string", 100)
    ensure_attribute(coll_users, "email", "string", 100)

    # ADD SEARCH INDEXES (Fulltext is required for Query.contains)
    print("\nAdding Search Indexes for Contact Discovery...")
    ensure_index(coll_users, "idx_ft_username", "fulltext", ["username"])
    ensure_index(coll_users, "idx_ft_email", "fulltext", ["email"])
    ensure_index(coll_users, "idx_ft_phone", "fulltext", ["phone"])

    print("\n--- SCHEMA UPDATE V10 COMPLETE ---")

if __name__ == "__main__":
    setup_v10()
