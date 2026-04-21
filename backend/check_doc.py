from appwrite.client import Client
from appwrite.services.databases import Databases
import os
from dotenv import load_dotenv

load_dotenv()
client = Client().set_endpoint(os.getenv("APPWRITE_ENDPOINT")).set_project(os.getenv("APPWRITE_PROJECT_ID")).set_key(os.getenv("APPWRITE_API_KEY"))
databases = Databases(client)

res = databases.list_documents(os.getenv("APPWRITE_DATABASE_ID"), "users_data")
if res.documents:
    doc = res.documents[0]
    print(f"Document type: {type(doc)}")
    print(f"Attributes: {dir(doc)}")
    try:
        print(f"ID via .id: {doc.id}")
    except:
        print("No .id")
    try:
        print(f"ID via .['$id']: {doc['$id']}")
    except Exception as e:
        print(f"Fail via []: {e}")
