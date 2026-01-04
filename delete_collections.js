// delete_collections.js
// Usage examples:
//  node delete_collections.js properties rooms
//  node delete_collections.js --key ./serviceAccount.json --dry-run properties rooms
//  node delete_collections.js --key ./serviceAccount.json --recursive properties rooms
// Flags:
//  --key PATH       Path to service account JSON (sets GOOGLE_APPLICATION_CREDENTIALS)
//  --dry-run        Back up only, do not delete documents
//  --recursive      Also attempt to delete subcollections under each document
//  --yes            Skip confirmation prompt

let admin;
try {
  admin = require('firebase-admin');
} catch (e) {
  console.error('\nERROR: Missing dependency "firebase-admin".');
  console.error('Install with: npm install firebase-admin');
  console.error('See DELETE_README.md for full instructions.');
  process.exit(1);
}
const fs = require('fs');
const path = require('path');

// Simple arg parsing
const argv = process.argv.slice(2);
let keyPath = null;
let dryRun = false;
let recursive = false;
let autoYes = false;
const collections = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--key') { keyPath = argv[++i]; }
  else if (a === '--dry-run') { dryRun = true; }
  else if (a === '--recursive') { recursive = true; }
  else if (a === '--yes') { autoYes = true; }
  else if (a.startsWith('--')) { console.warn('Unknown flag', a); }
  else collections.push(a);
}

if (keyPath) process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS or pass --key /path/to/serviceAccount.json');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault()
});
const db = admin.firestore();

async function deleteSubcollectionsOfDoc(docRef) {
  const subcols = await docRef.listCollections();
  for (const subcol of subcols) {
    console.log(`    Found subcollection: ${subcol.id} (deleting its documents)`);
    await deleteCollectionRecursive(subcol.path);
  }
}

async function deleteCollectionRecursive(collectionPath) {
  // collectionPath can be 'collection' or 'collection/doc/subcollection' etc.
  const colRef = db.collection(collectionPath);
  const pageSize = 500;
  let totalDeleted = 0;
  while (true) {
    const snap = await colRef.limit(pageSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;
    console.log(`      Deleted ${snap.size} docs from ${collectionPath} (total ${totalDeleted})`);
    await new Promise(r => setTimeout(r, 150));
  }
  return totalDeleted;
}

async function backupAndOptionallyDeleteCollection(colName) {
  console.log(`\n--- Processing collection: ${colName}`);
  const backup = [];
  const pageSize = 500;
  let lastDoc = null;
  let totalDeleted = 0;

  while (true) {
    let q = db.collection(colName).limit(pageSize);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    // accumulate backup data
    snap.docs.forEach(doc => backup.push({ id: doc.id, data: doc.data() }));

    if (!dryRun) {
      // delete batch
      const batch = db.batch();
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      totalDeleted += snap.size;
      console.log(`  Deleted batch of ${snap.size} documents (total deleted: ${totalDeleted})`);

      if (recursive) {
        // attempt to delete subcollections for each doc
        for (const doc of snap.docs) {
          try {
            await deleteSubcollectionsOfDoc(doc.ref);
          } catch (e) {
            console.warn('    Failed to delete subcollections for', doc.id, e.message || e);
          }
        }
      }
    } else {
      console.log(`  Dry-run: backed up batch of ${snap.size} documents`);
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    // small pause
    await new Promise(r => setTimeout(r, 200));
  }

  const backupFile = path.resolve(`${colName}_backup_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`Backed up ${backup.length} documents to ${backupFile}`);
  if (!dryRun) console.log(`Finished deleting ${totalDeleted} documents from ${colName}`);
  else console.log(`Dry-run: no deletions performed for ${colName}`);
}

(async () => {
  if (collections.length === 0) {
    console.error('Provide collection names: node delete_collections.js [--key path] [--dry-run] [--recursive] properties rooms');
    process.exit(1);
  }

  console.log('Settings:');
  console.log('  Collections:', collections.join(', '));
  console.log('  Dry run:', dryRun);
  console.log('  Recursive subcollection delete:', recursive);

  if (!autoYes) {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await new Promise(resolve => rl.question(`\nProceed? This will backup then ${dryRun ? '[DRY RUN] not delete' : 'delete'} documents in the listed collections (yes/no): `, resolve));
    rl.close();
    if (!['y','yes'].includes(String(ans).trim().toLowerCase())) {
      console.log('Aborted by user. No changes made.');
      process.exit(0);
    }
  }

  for (const c of collections) {
    try {
      await backupAndOptionallyDeleteCollection(c);
    } catch (err) {
      console.error(`Error processing ${c}:`, err);
    }
  }

  console.log('\nAll done.');
  process.exit(0);
})();
