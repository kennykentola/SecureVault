
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
            "limit(5)"
        ]
    )
    for doc in res.documents:
        d = doc.data if hasattr(doc, 'data') else doc
        print(f"ID: {doc.id} | From: {d.get('sender_id')} | To: {d.get('receiver_id')} | Text: {d.get('ciphertext')[:10]}...")
except Exception as e:
    import traceback
    traceback.print_exc()
