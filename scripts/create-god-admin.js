#!/usr/bin/env node
const path = require("path");
const fs = require("fs");
(function _agentFirstLog() {
  const p = path.resolve(__dirname, "..", ".cursor", "debug.log");
  const fallback = path.resolve(__dirname, "..", "create-god-admin-debug.log");
  const payload = JSON.stringify({ location: "create-god-admin.js:top", message: "script started", data: { argv: process.argv.length, hasAdminEmail: !!process.env.ADMIN_EMAIL, hasAdminPassword: !!process.env.ADMIN_PASSWORD, hasCredsEnv: !!process.env.GOOGLE_APPLICATION_CREDENTIALS }, timestamp: Date.now(), hypothesisId: "B" }) + "\n";
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.appendFileSync(p, payload); } catch (_) { try { fs.appendFileSync(fallback, payload); } catch (_) {} }
})();
/**
 * Creates or updates a god admin user in Firebase Auth and Firestore.
 * Requires Firebase Admin SDK credentials (service account key).
 *
 * Usage:
 *   Set env vars then run: node scripts/create-god-admin.js
 *
 * Required env:
 *   ADMIN_EMAIL       - Admin login email
 *   ADMIN_PASSWORD    - Admin login password (min 6 chars)
 *   ADMIN_DISPLAY_NAME - Display name (optional, defaults to email prefix)
 *
 *   GOOGLE_APPLICATION_CREDENTIALS - Path to Firebase service account JSON key
 *     (Download from Firebase Console → Project Settings → Service Accounts → Generate new private key)
 *
 *   Or set FIREBASE_PROJECT_ID and pass key path: node scripts/create-god-admin.js path/to/serviceAccountKey.json
 *
 *   Before running: In Firebase Console → Authentication → Sign-in method, enable "Email/Password".
 *   Otherwise you'll get auth/configuration-not-found and the script won't create the user or write to Firestore.
 */

const projectRoot = path.resolve(__dirname, "..");

// Load .env from project root (or .env.example if .env missing) so ADMIN_* and GOOGLE_APPLICATION_CREDENTIALS are set
function loadEnv(dir) {
  function parse(pathToTry) {
    try {
      const content = fs.readFileSync(pathToTry, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
          value = value.slice(1, -1);
        if (key) process.env[key] = value;
      }
      return true;
    } catch (e) {
      if (e.code === "ENOENT") return false;
      console.warn("Warning: could not load env file:", e.message);
      return false;
    }
  }
  if (!parse(path.join(dir, ".env"))) parse(path.join(dir, ".env.example"));
}
loadEnv(projectRoot);

const admin = require(path.join(projectRoot, "node_modules", "firebase-admin"));

// #region agent log
const _debugLogPath = path.resolve(__dirname, "..", ".cursor", "debug.log");
const _fallbackLogPath = path.resolve(__dirname, "..", "create-god-admin-debug.log");
const _writeLog = (line) => {
  try { fs.mkdirSync(path.dirname(_debugLogPath), { recursive: true }); fs.appendFileSync(_debugLogPath, line); } catch (e) { try { fs.appendFileSync(_fallbackLogPath, line); } catch (_) {} }
};
const _log = (location, message, data, hypothesisId) => {
  const line = JSON.stringify({ location, message, data: data || {}, timestamp: Date.now(), hypothesisId }) + "\n";
  _writeLog(line);
  fetch('http://127.0.0.1:7242/ingest/7ffa446b-ae5d-4a02-b98f-db1962ffda1f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location,message,data:data||{},timestamp:Date.now(),hypothesisId})}).catch(()=>{});
};
// #endregion

function getCredentials() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.argv[2];
  // #region agent log
  _log('create-god-admin.js:getCredentials', 'getCredentials result', { hasKeyPath: !!keyPath, keyPathLength: keyPath ? keyPath.length : 0, argv2: process.argv[2] }, 'A');
  // #endregion
  if (keyPath) {
    return keyPath;
  }
  if (process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT) {
    return undefined; // will use default credentials
  }
  // #region agent log
  _log('create-god-admin.js:getCredentials', 'exit: no credentials', {}, 'A');
  // #endregion
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path, or pass it as first argument.");
  process.exit(1);
}

async function main() {
  // #region agent log
  _log('create-god-admin.js:main', 'main entered', { cwd: process.cwd() }, 'B');
  // #endregion
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const displayName = process.env.ADMIN_DISPLAY_NAME || (email && email.split("@")[0]) || "God Admin";

  // #region agent log
  _log('create-god-admin.js:main', 'env check', { hasEmail: !!email, hasPassword: !!password, passwordLen: password ? password.length : 0 }, 'B');
  // #endregion

  if (!email || !password) {
    // #region agent log
    _log('create-god-admin.js:main', 'exit: missing env', {}, 'B');
    // #endregion
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.");
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("ADMIN_PASSWORD must be at least 6 characters.");
    process.exit(1);
  }

  const keyPath = getCredentials();
  if (keyPath) {
    const resolved = path.isAbsolute(keyPath) ? keyPath : path.resolve(projectRoot, keyPath);
    // #region agent log
    _log('create-god-admin.js:main', 'before read key', { resolved, cwd: process.cwd(), keyPathRaw: keyPath }, 'A');
    // #endregion
    let key;
    try {
      key = JSON.parse(fs.readFileSync(resolved, "utf8"));
    } catch (e) {
      // #region agent log
      _log('create-god-admin.js:main', 'key read failed', { resolved, errMessage: e.message, errCode: e.code }, 'A');
      // #endregion
      console.error("Failed to read service account key from", resolved, e.message);
      process.exit(1);
    }
    // #region agent log
    _log('create-god-admin.js:main', 'before init app', { keyHasProjectId: !!(key && key.project_id) }, 'C');
    // #endregion
    try {
      admin.initializeApp({ credential: admin.credential.cert(key) });
    } catch (e) {
      // #region agent log
      _log('create-god-admin.js:main', 'init app failed', { errMessage: e.message }, 'C');
      // #endregion
      throw e;
    }
  } else {
    admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT });
  }

  const auth = admin.auth();
  const db = admin.firestore();

  let uid;
  // #region agent log
  _log('create-god-admin.js:main', 'before auth.getUserByEmail', { emailSet: !!email }, 'D');
  // #endregion
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    // #region agent log
    _log('create-god-admin.js:main', 'auth branch existing user', { uid }, 'D');
    // #endregion
    await auth.updateUser(uid, { password, displayName });
    console.log("Updated existing user:", email, "UID:", uid);
  } catch (e) {
    // #region agent log
    _log('create-god-admin.js:main', 'auth catch', { code: e.code, message: e.message }, 'D');
    // #endregion
    if (e.code === "auth/user-not-found") {
      const user = await auth.createUser({ email, password, displayName, emailVerified: true });
      uid = user.uid;
      // #region agent log
      _log('create-god-admin.js:main', 'auth branch created user', { uid }, 'D');
      // #endregion
      console.log("Created new admin user:", email, "UID:", uid);
    } else {
      if (e.code === "auth/configuration-not-found") {
        console.error(
          "Firebase Auth error: Email/Password sign-in is not enabled. In Firebase Console go to Authentication → Sign-in method and enable 'Email/Password', then run this script again."
        );
        process.exit(1);
      }
      throw e;
    }
  }

  // #region agent log
  _log('create-god-admin.js:main', 'before Firestore set', { uid }, 'E');
  // #endregion
  try {
    await db.collection("users").doc(uid).set(
      {
        role: "admin",
        displayName,
        email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    // #region agent log
    _log('create-god-admin.js:main', 'Firestore set failed', { message: e.message, code: e.code }, 'E');
    // #endregion
    throw e;
  }
  console.log("Firestore users/" + uid + " set to role: admin");
  console.log("God admin is ready. Sign in at your app with:", email);
}

main().catch((e) => {
  // #region agent log
  _log('create-god-admin.js:main.catch', 'main() rejected', { message: e.message, code: e.code }, 'D');
  // #endregion
  console.error(e);
  process.exit(1);
});
