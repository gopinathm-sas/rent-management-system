/**
 * Tenant Document Upload to Google Drive (Admin-owned) via Apps Script Web App
 *
 * Deploy as a Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * The client sends JSON: { inviteId, roomId, idToken, fileName, originalName, contentType, size, base64 }
 * This script:
 *  - Fetches tenantUploadInvites/{inviteId} from Firestore REST using the tenant's Firebase ID token
 *  - Validates invite status/expiry + roomId
 *  - Stores file into ROOT_FOLDER_ID/Room_XX/...
 *  - Returns { ok:true, fileId, webViewLink, downloadLink }
 */

const FIREBASE_PROJECT_ID = 'munirathnam-illam';
const ROOT_FOLDER_ID = 'PUT_YOUR_ROOT_DRIVE_FOLDER_ID_HERE';

function doPost(e) {
  try {
    const body = parseJsonBody_(e);

    const inviteId = string_(body.inviteId);
    const roomId = string_(body.roomId);
    const idToken = string_(body.idToken);
    const fileName = safeFileName_(string_(body.fileName) || 'file');
    const originalName = string_(body.originalName);
    const contentType = string_(body.contentType);
    const size = number_(body.size);
    const base64 = string_(body.base64);

    if (!inviteId) return jsonError_(400, 'Missing inviteId');
    if (!roomId) return jsonError_(400, 'Missing roomId');
    if (!idToken) return jsonError_(401, 'Missing idToken');
    if (!base64) return jsonError_(400, 'Missing file data');

    if (size && size > 10 * 1024 * 1024) return jsonError_(400, 'File too large (max 10MB)');

    const invite = fetchInviteFromFirestore_(inviteId, idToken);
    validateInvite_(invite, roomId);

    const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
    const roomFolder = getOrCreateFolder_(root, 'Room_' + pad2_(invite.roomId));

    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, contentType || MimeType.BINARY, fileName);

    const created = roomFolder.createFile(blob);

    // Optional: include original name in description for admin convenience
    if (originalName) {
      try { created.setDescription('Original name: ' + originalName); } catch (_) {}
    }

    const fileId = created.getId();
    const webViewLink = 'https://drive.google.com/file/d/' + encodeURIComponent(fileId) + '/view';
    const downloadLink = 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(fileId);

    return jsonOk_({
      ok: true,
      fileId: fileId,
      webViewLink: webViewLink,
      downloadLink: downloadLink
    });
  } catch (err) {
    return jsonError_(500, (err && err.message) ? err.message : String(err));
  }
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error('Missing request body');
  try {
    return JSON.parse(e.postData.contents);
  } catch (_) {
    throw new Error('Invalid JSON');
  }
}

function fetchInviteFromFirestore_(inviteId, idToken) {
  const url = 'https://firestore.googleapis.com/v1/projects/'
    + encodeURIComponent(FIREBASE_PROJECT_ID)
    + '/databases/(default)/documents/tenantUploadInvites/'
    + encodeURIComponent(inviteId);

  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + idToken
    }
  });

  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) {
    // If Firestore rules deny, this will be 403.
    throw new Error('Invite validation failed (Firestore HTTP ' + code + ')');
  }

  const doc = JSON.parse(text);
  const fields = doc && doc.fields ? doc.fields : {};

  const invite = {
    emailLower: getString_(fields.emailLower),
    roomId: getString_(fields.roomId),
    status: getString_(fields.status),
    expiresAt: getTimestampMs_(fields.expiresAt)
  };

  return invite;
}

function validateInvite_(invite, expectedRoomId) {
  if (!invite) throw new Error('Invite not found');
  if (!invite.roomId) throw new Error('Invite missing roomId');
  if (String(invite.roomId) !== String(expectedRoomId)) throw new Error('Room mismatch');

  // Treat missing status as active (backward compatible)
  if (invite.status && invite.status !== 'active') throw new Error('Invite is not active');

  if (invite.expiresAt && invite.expiresAt < Date.now()) throw new Error('Invite has expired');
}

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function getString_(field) {
  if (!field) return '';
  if (field.stringValue !== undefined) return String(field.stringValue || '');
  return '';
}

function getTimestampMs_(field) {
  if (!field) return 0;
  const ts = field.timestampValue;
  if (!ts) return 0;
  const ms = Date.parse(ts);
  return isNaN(ms) ? 0 : ms;
}

function safeFileName_(name) {
  const raw = String(name || 'file').trim();
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, '_').substring(0, 120);
  return cleaned || 'file';
}

function pad2_(v) {
  const s = String(v || '').trim();
  return s.length === 1 ? '0' + s : s;
}

function string_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function number_(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function jsonOk_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError_(code, message) {
  // Apps Script web apps can't set HTTP status reliably in all contexts; return JSON error.
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: String(message || 'Error'), code: code }))
    .setMimeType(ContentService.MimeType.JSON);
}
