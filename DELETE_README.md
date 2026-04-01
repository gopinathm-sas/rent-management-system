Delete collections safely (backup + delete)

This repository includes `delete_collections.js` — a utility script that:
- Backs up each document in the specified collection to a local JSON file
- Deletes documents in batches (500 per batch)

Important:
- This permanently deletes Firestore documents. Subcollections are not deleted by this script.
- Run only after confirming backups/exports if your data is important.

Setup & run
1. Install dependencies

```bash
npm init -y
npm install firebase-admin
```

2. Create a Firebase service account (JSON) with Firestore access and set the env var:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
```

3. Run the script (example deletes `properties` and `rooms`):

```bash
node delete_collections.js properties rooms
```

Output:
- Creates `properties_backup_<timestamp>.json` and `rooms_backup_<timestamp>.json` in the working directory.
- Prints progress to the console.

Notes & recommendations
- For large datasets consider exporting via `gcloud`/Firestore export first.
- If you need to delete subcollections or more complex graph cleanup, I can extend the script.
- The script pauses briefly between batches to reduce API pressure.
