// delete_collections.js
// Usage: node delete_collections.js properties rooms
// This script backs up each collection to a local JSON file and deletes documents in batches.
// Requirements:
//  - Node 16+
//  - A Firebase service account JSON set to GOOGLE_APPLICATION_CREDENTIALS
//  - npm install firebase-admin

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service-account.json path.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault()
});
const db = admin.firestore();

async function backupAndDeleteCollection(colName) {
  console.log(`\n--- Processing collection: ${colName}`);
  const backup = [];
  let totalDeleted = 0;
  const pageSize = 500;
  let lastDoc = null;

  while (true) {
    let q = db.collection(colName).limit(pageSize);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach(doc => {
      backup.push({ id: doc.id, data: doc.data() });
      batch.delete(doc.ref);
    });

    await batch.commit();
    totalDeleted += snap.size;
    lastDoc = snap.docs[snap.docs.length - 1];
    console.log(`  Deleted batch of ${snap.size} documents (total deleted: ${totalDeleted})`);

    // small pause to be nice to the API
    await new Promise(r => setTimeout(r, 200));
  }

  const backupFile = path.resolve(`${colName}_backup_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`Backed up ${backup.length} documents to ${backupFile}`);
  console.log(`Finished deleting ${totalDeleted} documents from ${colName}`);
}

(async () => {
  const cols = process.argv.slice(2);
  if (cols.length === 0) {
    console.error('Provide collection names: node delete_collections.js properties rooms');
    process.exit(1);
  }

  for (const c of cols) {
    try {
      await backupAndDeleteCollection(c);
    } catch (err) {
      console.error(`Error processing ${c}:`, err);
    }
  }

  console.log('\nAll done.');
  process.exit(0);
})();
