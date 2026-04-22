
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
        "users_data"
    )
    for doc in res.documents:
        # Use getattr or dictionary-like access if available, otherwise check __dict__
        d = doc.data if hasattr(doc, 'data') else doc
        username = d.get('username', 'N/A')
        email = d.get('email', 'N/A')
        uid = d.get('user_id', 'N/A')
        pk = d.get('public_key', 'N/A')
        print(f"User: {username} | Email: {email} | ID: {uid} | PK_Prefix: {pk[:20]}...")
except Exception as e:
    import traceback
    traceback.print_exc()
