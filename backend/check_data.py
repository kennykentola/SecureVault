import os
from dotenv import load_dotenv
from appwrite.client import Client
from appwrite.services.databases import Databases

load_dotenv()

client = Client()
client.set_endpoint(os.getenv('APPWRITE_ENDPOINT'))
client.set_project(os.getenv('APPWRITE_PROJECT_ID'))
client.set_key(os.getenv('APPWRITE_API_KEY'))

databases = Databases(client)

try:
    users = databases.list_documents(
        os.getenv('APPWRITE_DATABASE_ID'),
        'users_data'
    )
    print(f"TOTAL USERS IN DATABASE: {users['total']}")
    for u in users['documents']:
        print(f"- {u['username']} ({u['user_id']})")
except Exception as e:
    print(f"ERROR: {e}")
