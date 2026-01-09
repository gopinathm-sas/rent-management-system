# Google Drive (Admin-owned) uploads via Apps Script

Firebase Storage can’t be enabled on this project without upgrading billing. This app supports uploading tenant documents to **admin-owned Google Drive** using a Google Apps Script Web App.

## 1) Create a Drive folder
1. In Google Drive (admin account), create a folder, e.g. `Tenant Documents`.
2. Open the folder and copy its **Folder ID** from the URL.

## 2) Create the Apps Script Web App
1. Go to https://script.google.com
2. New project
3. Create a file (e.g. `Code.gs`) and paste the contents of:
   - [apps-script/tenant-drive-upload.gs](apps-script/tenant-drive-upload.gs)
4. Edit constants at the top:
   - `FIREBASE_PROJECT_ID` = `munirathnam-illam`
   - `ROOT_FOLDER_ID` = your Drive folder ID

## 3) Deploy
1. Click **Deploy** → **New deployment**
2. Select type: **Web app**
3. **Execute as**: Me
4. **Who has access**: Anyone
5. Deploy and copy the **Web app URL** (ends with `/exec`)

## 4) Use it in the app
1. Login as Admin
2. Go to Admin → Tenant document upload link
3. Paste the Web app URL in **Drive Upload Web App URL (Apps Script)**
4. Generate a tenant link

Tenants will continue to:
- sign in via email-link (Firebase Auth)
- upload documents
- the app saves submission metadata to Firestore

## Notes
- Files will be stored under `ROOT_FOLDER_ID/Room_XX/`.
- Access: Admin opens Drive links; the admin must be signed into the same Google account in the browser.
