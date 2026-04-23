import os
import sys
import argparse
from datetime import datetime
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.services.storage import Storage
from appwrite.services.users import Users
from appwrite.query import Query
from appwrite.id import ID
from appwrite.permission import Permission
from appwrite.role import Role

# Load environment variables
load_dotenv()

class AppManager:
    def __init__(self):
        self.endpoint = os.getenv("APPWRITE_ENDPOINT")
        self.project_id = os.getenv("APPWRITE_PROJECT_ID")
        self.api_key = os.getenv("APPWRITE_API_KEY")
        self.db_id = os.getenv("APPWRITE_DATABASE_ID")
        self.bucket_id = os.getenv("APPWRITE_BUCKET_ID") or "e2eemessaging"

        if not all([self.endpoint, self.project_id, self.api_key, self.db_id]):
            print("ERROR: Missing required environment variables. Check your .env file.")
            sys.exit(1)

        self.client = Client()
        self.client.set_endpoint(self.endpoint)
        self.client.set_project(self.project_id)
        self.client.set_key(self.api_key)

        self.databases = Databases(self.client)
        self.storage = Storage(self.client)
        self.users_service = Users(self.client)

    def get_val(self, obj, key, default=None):
        if isinstance(obj, dict):
            return obj.get(key, default)
        
        # Handle Appwrite Document objects
        if hasattr(obj, 'data') and isinstance(obj.data, dict):
            if key in obj.data:
                return obj.data[key]
        
        # Special mapping for Appwrite system fields
        if key == '$id': return getattr(obj, 'id', default)
        if key == '$createdAt': return getattr(obj, 'createdat', default)
        if key == '$updatedAt': return getattr(obj, 'updatedat', default)
        
        return getattr(obj, key, default)

    # --- SETUP COMMANDS ---
    def ensure_attribute(self, coll_id, attr_name, attr_type, size=5000, required=False, default=None):
        try:
            self.databases.get_attribute(self.db_id, coll_id, attr_name)
            print(f"Attribute '{attr_name}' already exists in '{coll_id}'")
        except:
            print(f"Adding attribute '{attr_name}' to '{coll_id}'...")
            try:
                if attr_type == "string":
                    self.databases.create_string_attribute(self.db_id, coll_id, attr_name, size, required, default)
                elif attr_type == "boolean":
                    self.databases.create_boolean_attribute(self.db_id, coll_id, attr_name, required, default)
                elif attr_type == "integer":
                    self.databases.create_integer_attribute(self.db_id, coll_id, attr_name, required, min=0, default=default)
                print(f"   Successfully added '{attr_name}'")
            except Exception as e:
                print(f"   Failed to add '{attr_name}': {e}")

    def ensure_index(self, coll_id, index_name, index_type, attributes):
        try:
            results = self.databases.list_indexes(self.db_id, coll_id)
            if any(self.get_val(idx, 'key') == index_name for idx in results.indexes):
                print(f"Index '{index_name}' already exists in '{coll_id}'")
                return
            
            print(f"Creating index '{index_name}' ({index_type}) on {attributes} in '{coll_id}'...")
            self.databases.create_index(self.db_id, coll_id, index_name, index_type, attributes)
            print(f"   Successfully created '{index_name}'")
        except Exception as e:
            print(f"   Failed to create index '{index_name}': {e}")

    def setup(self):
        print("--- STARTING SCHEMA ALIGNMENT (V10) ---")
        
        # 1. FIX MESSAGES COLLECTION
        coll_messages = "messages"
        print(f"\nAligning '{coll_messages}' collection...")
        self.ensure_attribute(coll_messages, "group_id", "string", 36)
        self.ensure_attribute(coll_messages, "sender_name", "string", 100)
        self.ensure_attribute(coll_messages, "encrypted_key", "string", 1000)
        self.ensure_attribute(coll_messages, "payload", "string", 20000)
        
        # 2. FIX USERS_DATA COLLECTION & SEARCH INDEXES
        coll_users = "users_data"
        print(f"\nAligning '{coll_users}' collection...")
        self.ensure_attribute(coll_users, "phone", "string", 20)
        self.ensure_attribute(coll_users, "public_key", "string", 4000)
        self.ensure_attribute(coll_users, "vault_backup", "string", 12000)
        self.ensure_attribute(coll_users, "legacy_vault_backups", "string", 30000)
        self.ensure_attribute(coll_users, "username", "string", 100)
        self.ensure_attribute(coll_users, "email", "string", 100)

        # ADD SEARCH INDEXES
        print("\nAdding Search Indexes for Contact Discovery...")
        self.ensure_index(coll_users, "idx_ft_username", "fulltext", ["username"])
        self.ensure_index(coll_users, "idx_ft_email", "fulltext", ["email"])
        self.ensure_index(coll_users, "idx_ft_phone", "fulltext", ["phone"])

        # 3. FIX GROUPS COLLECTION
        coll_groups = "groups"
        print(f"\nAligning '{coll_groups}' collection...")
        self.ensure_attribute(coll_groups, "is_admin_only", "boolean", required=False, default=False)
        self.ensure_attribute(coll_groups, "members_can_add", "boolean", required=False, default=True)

        # 4. FIX STATUS_KEYS COLLECTION
        coll_status_keys = "status_keys"
        print(f"\nAligning '{coll_status_keys}' collection...")
        self.ensure_attribute(coll_status_keys, "poster_id", "string", 100)
        self.ensure_attribute(coll_status_keys, "recipient_id", "string", 100)
        self.ensure_attribute(coll_status_keys, "encrypted_key", "string", 5000)
        self.ensure_attribute(coll_status_keys, "created_at", "string", 100)

        print("\n--- SCHEMA UPDATE COMPLETE ---")

    # --- CHECK COMMANDS ---
    def check(self):
        print("--- RUNNING DATA CHECKS ---")
        try:
            # Check users
            users = self.databases.list_documents(self.db_id, 'users_data')
            total = self.get_val(users, 'total', 0)
            print(f"\nTOTAL USERS IN DATABASE: {total}")
            for u in users.documents:
                username = self.get_val(u, 'username', 'N/A')
                user_id = self.get_val(u, 'user_id', 'N/A')
                email = self.get_val(u, 'email', 'N/A')
                print(f"- {username} (ID: {user_id}, Email: {email})")

            # Check messages
            print("\nLATEST MESSAGES:")
            msgs = self.databases.list_documents(self.db_id, "messages", [Query.order_desc("timestamp"), Query.limit(5)])
            for m in msgs.documents:
                m_id = self.get_val(m, '$id') or self.get_val(m, 'id')
                sender = self.get_val(m, 'sender_id')
                receiver = self.get_val(m, 'receiver_id', 'GROUP')
                ts = self.get_val(m, 'timestamp')
                print(f"ID: {m_id} | From: {sender} | To: {receiver} | Time: {ts}")
            
        except Exception as e:
            print(f"CHECK ERROR: {e}")
            import traceback
            traceback.print_exc()

    # --- FIX COMMANDS ---
    def fix(self, target="all"):
        if target in ["all", "groups"]:
            self.fix_groups()
        if target in ["all", "permissions"]:
            self.fix_permissions()
        if target in ["all", "storage"]:
            self.fix_storage()

    def fix_groups(self):
        print("\n--- REPAIRING GROUP VISIBILITY ---")
        try:
            groups_res = self.databases.list_documents(self.db_id, "groups")
            groups = groups_res.documents
            
            for g in groups:
                group_id = self.get_val(g, 'group_id') or self.get_val(g, '$id')
                creator_id = self.get_val(g, 'created_by')
                
                if not group_id or not creator_id:
                    continue
                    
                members_res = self.databases.list_documents(self.db_id, "group_members", [
                    Query.equal("group_id", group_id),
                    Query.equal("user_id", creator_id)
                ])
                
                if self.get_val(members_res, 'total', 0) == 0:
                    print(f"Repairing group {self.get_val(g, 'name', 'Unknown')} ({group_id}): Adding creator {creator_id}...")
                    self.databases.create_document(self.db_id, "group_members", ID.unique(), {
                        "group_id": group_id,
                        "user_id": creator_id,
                        "role": "admin",
                        "encrypted_group_key": "REPAIR_PENDING" 
                    })
                else:
                    print(f"Group {self.get_val(g, 'name', 'Unknown')} is OK.")
        except Exception as e:
            print(f"Group Repair Failed: {e}")

    def fix_permissions(self):
        print("\n--- REPAIRING MESSAGE PERMISSIONS ---")
        try:
            result = self.databases.list_documents(self.db_id, 'messages')
            docs = result.documents
            print(f"Found {len(docs)} messages to repair.")
            
            for doc in docs:
                doc_id = self.get_val(doc, '$id') or self.get_val(doc, 'id')
                self.databases.update_document(
                    self.db_id,
                    'messages',
                    doc_id,
                    permissions=[Permission.read(Role.users())]
                )
            print("All message permissions repaired.")
        except Exception as e:
            print(f"Permission Repair Failed: {e}")

    def fix_storage(self):
        print(f"\n--- FIXING STORAGE PERMISSIONS ({self.bucket_id}) ---")
        try:
            bucket = self.storage.get_bucket(self.bucket_id)
            self.storage.update_bucket(
                self.bucket_id,
                self.get_val(bucket, 'name'),
                permissions=["read(\"any\")", "create(\"users\")", "update(\"users\")", "delete(\"users\")"],
                file_security=True,
                enabled=True
            )
            print("Bucket permissions updated.")
        except Exception as e:
            print(f"Bucket update failed, trying to create: {e}")
            try:
                self.storage.create_bucket(
                    self.bucket_id,
                    "SecureVault Storage",
                    permissions=["read(\"any\")", "create(\"users\")", "update(\"users\")", "delete(\"users\")"],
                    file_security=True
                )
                print("Bucket created with correct permissions.")
            except Exception as e2:
                print(f"Bucket creation failed: {e2}")

    # --- LIST COMMANDS ---
    def list_resources(self, resource_type):
        if resource_type == "users":
            self.check() # Reuse check
        elif resource_type == "routes":
            print("\n--- LISTING APP ROUTES ---")
            try:
                from main import app
                for route in app.routes:
                    print(f"Path: {route.path}, Name: {route.name}")
            except Exception as e:
                print(f"Could not list routes: {e}")

    # --- CLEANUP COMMANDS ---
    def cleanup(self):
        now = datetime.utcnow().isoformat()
        print(f"\n--- CLEANING EXPIRED STATUSES (older than {now}) ---")
        try:
            res = self.databases.list_documents(self.db_id, "statuses", [
                Query.less_than("expires_at", now),
                Query.limit(100)
            ])
            
            count = 0
            for doc in res.documents:
                status_id = self.get_val(doc, '$id') or self.get_val(doc, 'id')
                file_id = self.get_val(doc, 'content_url')
                
                if file_id:
                    try:
                        self.storage.delete_file(self.bucket_id, file_id)
                    except:
                        pass
                
                self.databases.delete_document(self.db_id, "statuses", status_id)
                count += 1
            
            print(f"Cleanup complete. Total deleted: {count}")
        except Exception as e:
            print(f"Cleanup Error: {e}")

    # --- SYNC COMMANDS ---
    def sync(self):
        print("\n--- SYNCING AUTH ACCOUNTS TO DB ---")
        try:
            auth_users = self.users_service.list()
            users_list = auth_users.users
            total = self.get_val(auth_users, 'total', 0)
            print(f"Found {total} users in Auth.")
            
            for user in users_list:
                user_id = self.get_val(user, '$id') or self.get_val(user, 'id')
                email = self.get_val(user, 'email')
                name = self.get_val(user, 'name')
                
                try:
                    self.databases.get_document(self.db_id, "users_data", user_id)
                except:
                    print(f"Creating missing profile for {email}...")
                    self.databases.create_document(
                        self.db_id,
                        "users_data",
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
            print("Sync complete.")
        except Exception as e:
            print(f"Sync Error: {e}")

    # --- ADMIN COMMANDS ---
    def assign_admin(self, email):
        print(f"\n--- ASSIGNING ADMIN ROLE TO {email} ---")
        try:
            res = self.databases.list_documents(self.db_id, "users_data", [Query.equal("email", email)])
            if self.get_val(res, 'total', 0) > 0:
                doc = res.documents[0]
                doc_id = self.get_val(doc, '$id') or self.get_val(doc, 'id')
                self.databases.update_document(self.db_id, "users_data", doc_id, {"role": "admin"})
                print(f"SUCCESS: {email} is now an ADMIN.")
            else:
                print(f"User {email} not found in users_data.")
        except Exception as e:
            print(f"Admin assignment failed: {e}")


def main():
    parser = argparse.ArgumentParser(description="SecureVault Management Utility")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    subparsers.add_parser("setup", help="Align database schema to latest version")
    subparsers.add_parser("check", help="Run diagnostic data checks")
    
    fix_parser = subparsers.add_parser("fix", help="Run repair scripts")
    fix_parser.add_argument("target", nargs="?", default="all", choices=["all", "groups", "permissions", "storage"], help="Target to fix")

    list_parser = subparsers.add_parser("list", help="List resources")
    list_parser.add_argument("resource", choices=["users", "routes"], help="Resource type to list")

    subparsers.add_parser("cleanup", help="Remove expired statuses and media")
    subparsers.add_parser("sync", help="Sync Auth accounts to Database profiles")

    admin_parser = subparsers.add_parser("admin", help="Assign admin role to a user")
    admin_parser.add_argument("email", help="Email of the user to make admin")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    manager = AppManager()

    if args.command == "setup":
        manager.setup()
    elif args.command == "check":
        manager.check()
    elif args.command == "fix":
        manager.fix(args.target)
    elif args.command == "list":
        manager.list_resources(args.resource)
    elif args.command == "cleanup":
        manager.cleanup()
    elif args.command == "sync":
        manager.sync()
    elif args.command == "admin":
        manager.assign_admin(args.email)

if __name__ == "__main__":
    main()
