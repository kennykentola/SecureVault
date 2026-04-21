import { Client, Account, Databases, Storage } from 'appwrite';

export const APPWRITE_CONFIG = {
    ENDPOINT: import.meta.env.VITE_APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1",
    PROJECT_ID: import.meta.env.VITE_APPWRITE_PROJECT_ID || "e2eemessaging",
    DATABASE_ID: import.meta.env.VITE_APPWRITE_DATABASE_ID || "e2eemessaging",
    COLLECTION_USERS: import.meta.env.VITE_COLLECTION_USERS || "users_data",
    COLLECTION_MESSAGES: import.meta.env.VITE_COLLECTION_MESSAGES || "messages",
    COLLECTION_REPORTS: import.meta.env.VITE_COLLECTION_REPORTS || "reports",
    BUCKET_ID: import.meta.env.VITE_APPWRITE_BUCKET_ID || "e2eemessaging"
};

console.log("Appwrite Config Loaded:", APPWRITE_CONFIG.PROJECT_ID ? "SUCCESS" : "FAILED");



const client = new Client()
    .setEndpoint(APPWRITE_CONFIG.ENDPOINT)
    .setProject(APPWRITE_CONFIG.PROJECT_ID);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export { client };
