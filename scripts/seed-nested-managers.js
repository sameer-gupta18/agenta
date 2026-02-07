#!/usr/bin/env node
/**
 * Sets reportsTo on existing managers to create a nested hierarchy.
 * Run after seed-dummy-data (or with existing managers in Firestore).
 * Requires GOOGLE_APPLICATION_CREDENTIALS.
 *
 * Usage: node scripts/seed-nested-managers.js   or   npm run seed-nested-managers
 */
const path = require("path");
const fs = require("fs");

const projectRoot = path.resolve(__dirname, "..");
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
      return false;
    }
  }
  if (!parse(path.join(dir, ".env"))) parse(path.join(dir, ".env.example"));
}
loadEnv(projectRoot);

const admin = require(path.join(projectRoot, "node_modules", "firebase-admin"));

function getCredentials() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.argv[2];
  if (keyPath) return path.isAbsolute(keyPath) ? keyPath : path.resolve(projectRoot, keyPath);
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS or pass key path as first argument.");
  process.exit(1);
}

async function main() {
  const keyPath = getCredentials();
  let key;
  try {
    key = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  } catch (e) {
    console.error("Failed to read service account key:", e.message);
    process.exit(1);
  }

  try {
    admin.initializeApp({ credential: admin.credential.cert(key) });
  } catch (e) {
    if (e.code === "app/duplicate-app") admin.app();
    else throw e;
  }

  const db = admin.firestore();
  const managersSnap = await db.collection("managers").get();
  const raw = managersSnap.docs.map((d) => ({ uid: d.id, displayName: d.data().displayName, ...d.data() }));

  // Rank order: highest-ranked first (Alex = Engineering Lead is root). Lower rank cannot manage higher rank.
  const RANK_ORDER = ["Alex Rivera", "Jordan Kim", "Sam Chen", "Taylor Reed", "Jamie Foster"];
  const rankOf = (name) => {
    const i = RANK_ORDER.indexOf(name);
    return i >= 0 ? i : RANK_ORDER.length;
  };
  const managers = raw.slice().sort((a, b) => rankOf(a.displayName) - rankOf(b.displayName));

  if (managers.length < 2) {
    console.log("Need at least 2 managers to set nested hierarchy. Found:", managers.length);
    process.exit(0);
  }

  // Root = highest rank (index 0). Structure: 1 and 2 report to 0, 3 reports to 1, 4 reports to 2.
  const rootUid = managers[0].uid;
  const updates = [];
  for (let i = 1; i < managers.length; i++) {
    const m = managers[i];
    let reportsTo = rootUid;
    if (i === 3 && managers.length > 1) reportsTo = managers[1].uid;   // Taylor → Jordan
    if (i === 4 && managers.length > 2) reportsTo = managers[2].uid;   // Jamie → Sam
    updates.push({ uid: m.uid, displayName: m.displayName, reportsTo });
  }

  for (const u of updates) {
    await db.collection("managers").doc(u.uid).update({
      reportsTo: u.reportsTo,
      updatedAt: Date.now(),
    });
    const parent = managers.find((m) => m.uid === u.reportsTo);
    console.log("Manager", u.displayName || u.uid, "→ reports to", parent?.displayName || u.reportsTo);
  }

  console.log("\nDone. Nested hierarchy: root + sub-managers reporting to root or to other managers.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
