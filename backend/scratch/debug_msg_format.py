
import os
import json
from appwrite.client import Client
from appwrite.services.databases import Databases
from dotenv import load_dotenv

load_dotenv()

client = Client()
client.set_endpoint(os.getenv("APPWRITE_ENDPOINT"))
client.set_project(os.getenv("APPWRITE_PROJECT_ID"))
client.set_key(os.getenv("APPWRITE_API_KEY"))

databases = Databases(client)

try:
    res = databases.list_documents(
        os.getenv("APPWRITE_DATABASE_ID"),
        "messages",
        queries=[
            "orderDesc('timestamp')",
            "limit(1)"
        ]
    )
    for doc in res.documents:
        d = doc.data if hasattr(doc, 'data') else doc
        print(f"ID: {doc.id}")
        print(f"Sender: {d.get('sender_id')}")
        print(f"EncKeyRaw: {d.get('encrypted_key')}")
except Exception as e:
    import traceback
    traceback.print_exc()
