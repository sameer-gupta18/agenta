#!/usr/bin/env node
/**
 * Detects and breaks cyclical reportsTo relationships between managers.
 * A lower-level manager must not manage someone above them (no cycles).
 * Requires GOOGLE_APPLICATION_CREDENTIALS.
 *
 * Usage: node scripts/fix-manager-cycles.js   or   npm run fix-manager-cycles
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

/**
 * Find a cycle in the reportsTo graph. Returns array of uids in the cycle, or null.
 * parent[uid] = reportsTo (the one they report to).
 */
function findCycle(parent) {
  const allUids = new Set(Object.keys(parent));
  const visited = new Set();

  for (const start of allUids) {
    if (visited.has(start)) continue;
    const path = [];
    const pathSet = new Set();
    let cur = start;
    while (cur) {
      if (pathSet.has(cur)) {
        const idx = path.indexOf(cur);
        return path.slice(idx);
      }
      if (visited.has(cur)) break;
      path.push(cur);
      pathSet.add(cur);
      cur = parent[cur] || null;
    }
    path.forEach((u) => visited.add(u));
  }
  return null;
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
  let totalFixed = 0;

  for (;;) {
    const snap = await db.collection("managers").get();
    const managers = snap.docs.map((d) => ({ uid: d.id, displayName: d.data().displayName, reportsTo: d.data().reportsTo || null }));

    const parent = {};
    managers.forEach((m) => {
      if (m.reportsTo) parent[m.uid] = m.reportsTo;
    });

    const cycle = findCycle(parent);
    if (!cycle) {
      if (totalFixed === 0) console.log("No cycles found. Manager hierarchy is acyclic.");
      else console.log("\nAll cycles fixed. Total updates:", totalFixed);
      break;
    }

    const names = managers.reduce((acc, m) => ({ ...acc, [m.uid]: m.displayName || m.uid }), {});
    console.log("Cycle found:", cycle.map((u) => names[u] || u).join(" → ") + " → ...");

    const breakUid = cycle[0];
    await db.collection("managers").doc(breakUid).update({
      reportsTo: admin.firestore.FieldValue.delete(),
      updatedAt: Date.now(),
    });
    totalFixed++;
    console.log("  Broke cycle: set", names[breakUid] || breakUid, "to have no reportsTo (now a root).");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
