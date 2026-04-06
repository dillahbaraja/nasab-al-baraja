import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd

# === INIT FIREBASE ===
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

# === PILIH COLLECTION ===
collection_name = "familyNodes"
docs = db.collection(collection_name).stream()

data = []

for doc in docs:
    d = doc.to_dict()
    d["doc_id"] = doc.id  # simpan ID dokumen
    data.append(d)

# === CONVERT KE DATAFRAME ===
df = pd.DataFrame(data)

# === SAVE FILE ===
df.to_csv("firebase_data.csv", index=False)
df.to_excel("firebase_data.xlsx", index=False)

print("Export selesai!")