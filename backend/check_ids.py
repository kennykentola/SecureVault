import os
import json
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
db_id = os.getenv("APPWRITE_DATABASE_ID")

print("Checking messages...")
res = databases.list_documents(db_id, "messages", [Query.order_desc("timestamp"), Query.limit(5)])

for doc in res.documents:
    print(f"ID: {doc['$id']}")
    print(f"Sender: {doc['sender_id']}")
    print(f"Receiver: {doc['receiver_id']}")
    print(f"Timestamp: {doc['timestamp']}")
    print(f"Type: {doc.get('type')}")
    print("-" * 20)

print("\nChecking users_data...")
users = databases.list_documents(db_id, "users_data", [Query.limit(5)])
for u in users.documents:
    print(f"DocID: {u['$id']}")
    print(f"UserID: {u['user_id']}")
    print(f"Email: {u['email']}")
    print("-" * 20)
