#!/usr/bin/env node
/**
 * Updates all project assignments in Firestore with:
 * - deadline (from timeline string or default +30 days from createdAt)
 * - skillsRequired (inferred from title/description if missing)
 * Requires GOOGLE_APPLICATION_CREDENTIALS.
 *
 * Usage: node scripts/seed-assignment-fields.js
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

function inferSkillsRequired(title, description) {
  const t = (title || "").toLowerCase();
  const d = (description || "").toLowerCase();
  const text = t + " " + d;
  const skills = [];
  if (/api|integration|rest|backend/.test(text)) skills.push("REST APIs", "Backend integration");
  if (/dashboard|admin|ui|redesign/.test(text)) skills.push("React", "TypeScript", "UI components");
  if (/e2e|cypress|test/.test(text)) skills.push("Cypress", "E2E testing", "Jest");
  if (/mobile|responsive|layout/.test(text)) skills.push("React", "CSS", "Responsive design");
  if (/database|migration|postgres/.test(text)) skills.push("PostgreSQL", "SQL", "Migrations");
  if (/doc|documentation/.test(text)) skills.push("Technical writing", "API documentation");
  if (/security|audit|auth/.test(text)) skills.push("Security audit", "Authentication");
  if (/performance|optimize|query/.test(text)) skills.push("Performance profiling", "SQL optimization");
  if (skills.length === 0) skills.push("Project delivery", "Collaboration");
  return [...new Set(skills)];
}

function toMillis(v) {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && typeof v.toMillis === "function") return v.toMillis();
  return 0;
}

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
  const assignmentsSnap = await db.collection("projectAssignments").get();

  let updated = 0;
  for (const d of assignmentsSnap.docs) {
    const data = d.data();
    const createdAt = toMillis(data.createdAt) || Date.now();
    let deadline = typeof data.deadline === "number" ? data.deadline : null;
    if (!deadline && data.timeline) {
      const tl = String(data.timeline).trim();
      if (/ASAP|urgent/i.test(tl)) deadline = createdAt + 7 * 24 * 60 * 60 * 1000;
      else {
        const parsed = Date.parse(tl);
        if (!isNaN(parsed)) deadline = parsed;
        else deadline = createdAt + 30 * 24 * 60 * 60 * 1000;
      }
    }
    if (!deadline) deadline = createdAt + 30 * 24 * 60 * 60 * 1000;

    const skillsRequired = Array.isArray(data.skillsRequired) && data.skillsRequired.length > 0
      ? data.skillsRequired
      : inferSkillsRequired(data.title, data.description);

    await d.ref.update({
      deadline,
      skillsRequired,
      updatedAt: Date.now(),
    });
    updated++;
    console.log(d.id, data.title, "-> deadline", new Date(deadline).toISOString().slice(0, 10), "skillsRequired", skillsRequired.length);
  }

  console.log("\nUpdated", updated, "assignments with deadline and skillsRequired.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
