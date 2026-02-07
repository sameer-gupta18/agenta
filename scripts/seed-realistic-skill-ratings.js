#!/usr/bin/env node
/**
 * Updates Firestore with coherent, realistic data:
 * 1. Adds varied skillsUsed to each assignment (keyword-based inference).
 * 2. Computes each employee's and manager's skillRatings (Elo) from completed projects so ELOs differ.
 * Run after seed-dummy-data (and optionally seed-nested-managers). Requires GOOGLE_APPLICATION_CREDENTIALS.
 *
 * Usage: node scripts/seed-realistic-skill-ratings.js
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

const DEFAULT_ELO = 1500;
const K = 24;
const IMPORTANCE_ELO = { low: 1400, medium: 1500, high: 1600, critical: 1700 };

function expectedScore(playerElo, opponentElo) {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

function eloUpdate(currentElo, opponentElo, score) {
  const expected = expectedScore(currentElo, opponentElo);
  return Math.round(currentElo + K * (score - expected));
}

function importanceToOpponentElo(importance) {
  return IMPORTANCE_ELO[importance] ?? 1500;
}

/**
 * Infer niche skillsUsed from assignment title and description.
 * If employeeSkills is provided, merges in 1–2 matching bio skills so their Elo goes up coherently.
 */
function inferSkillsUsed(title, description, employeeSkills) {
  const t = (title || "").toLowerCase();
  const d = (description || "").toLowerCase();
  const text = t + " " + d;
  const skills = [];

  if (/api|integration|rest|backend/.test(text)) skills.push("REST APIs", "Backend integration");
  if (/dashboard|admin|ui components|redesign/.test(text)) skills.push("React", "TypeScript", "UI components");
  if (/e2e|cypress|test|checkout/.test(text)) skills.push("Cypress", "E2E testing", "Jest");
  if (/mobile|responsive|layout|landing/.test(text)) skills.push("React", "CSS", "Responsive design");
  if (/database|migration|postgres|verify/.test(text)) skills.push("PostgreSQL", "SQL", "Migrations");
  if (/doc|documentation|api doc/.test(text)) skills.push("Technical writing", "API documentation", "Markdown");
  if (/security|audit|auth|permission/.test(text)) skills.push("Security audit", "Authentication", "Authorization");
  if (/performance|profile|optimize|slow|quer/.test(text)) skills.push("Performance profiling", "SQL optimization");

  const bio = Array.isArray(employeeSkills) ? employeeSkills : [];
  for (const s of bio) {
    const lower = (s || "").toLowerCase();
    if (!lower) continue;
    if (/react|typescript|ui|frontend|css/.test(text) && /react|typescript|css|figma|ui/.test(lower)) skills.push(s.trim());
    if (/api|backend|node|rest/.test(text) && /node|go|backend|api/.test(lower)) skills.push(s.trim());
    if (/cypress|jest|test|e2e/.test(text) && /cypress|jest|test/.test(lower)) skills.push(s.trim());
    if (/postgres|sql|migration|database/.test(text) && /postgres|sql|database/.test(lower)) skills.push(s.trim());
    if (/doc|documentation|markdown/.test(text) && /doc|markdown|writing/.test(lower)) skills.push(s.trim());
    if (/security|audit|auth/.test(text) && /audit|security|pen|auth/.test(lower)) skills.push(s.trim());
  }

  if (skills.length === 0) skills.push("Project delivery", "Collaboration");
  return [...new Set(skills)];
}

/**
 * Apply one completed assignment to an employee's skill ratings.
 */
function applyCompletionToRatings(currentRatings, skillsUsed, importance) {
  if (!skillsUsed || skillsUsed.length === 0) return currentRatings;
  const opponentElo = importanceToOpponentElo(importance);
  const next = { ...(currentRatings || {}) };
  for (const skill of skillsUsed) {
    const name = (skill || "").trim();
    if (!name) continue;
    const current = next[name] ?? DEFAULT_ELO;
    next[name] = eloUpdate(current, opponentElo, 1);
  }
  return next;
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

  const [employeesSnap, managersSnap, assignmentsSnap] = await Promise.all([
    db.collection("employeeProfiles").get(),
    db.collection("managers").get(),
    db.collection("projectAssignments").get(),
  ]);

  const toMs = (v) => (typeof v === "number" ? v : v && typeof v.toMillis === "function" ? v.toMillis() : 0);

  const employees = employeesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const managers = managersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const assignments = assignmentsSnap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, ...data, createdAt: toMs(data.createdAt), completedAt: data.completedAt != null ? toMs(data.completedAt) : null };
  });

  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const managerMap = new Map(managers.map((m) => [m.id, m]));

  console.log("Found", employees.length, "employees,", managers.length, "managers,", assignments.length, "assignments.\n");

  for (const a of assignments) {
    const assignee = a.assignedTo ? (employeeMap.get(a.assignedTo) || managerMap.get(a.assignedTo)) : null;
    const existingSkills = assignee && Array.isArray(assignee.skills) ? assignee.skills : [];
    const skillsUsed = a.skillsUsed && Array.isArray(a.skillsUsed) && a.skillsUsed.length > 0
      ? a.skillsUsed
      : inferSkillsUsed(a.title, a.description, existingSkills);
    await db.collection("projectAssignments").doc(a.id).update({ skillsUsed, updatedAt: Date.now() });
  }
  console.log("Updated all assignments with skillsUsed.\n");

  const completedByAssignee = {};
  for (const a of assignments) {
    if (a.status !== "completed") continue;
    const assignedTo = a.assignedTo;
    if (!assignedTo) continue;
    const assignee = employeeMap.get(assignedTo) || managerMap.get(assignedTo);
    const existingSkills = assignee && Array.isArray(assignee.skills) ? assignee.skills : [];
    let skillsUsed = a.skillsUsed && Array.isArray(a.skillsUsed) && a.skillsUsed.length > 0 ? a.skillsUsed : inferSkillsUsed(a.title, a.description, existingSkills);
    const completedAt = a.completedAt || a.createdAt || Date.now();
    if (!completedByAssignee[assignedTo]) completedByAssignee[assignedTo] = [];
    completedByAssignee[assignedTo].push({
      id: a.id,
      importance: a.importance || "medium",
      skillsUsed,
      completedAt,
    });
  }

  const isEmployee = (uid) => employeeMap.has(uid);
  for (const uid of Object.keys(completedByAssignee)) {
    const list = completedByAssignee[uid];
    list.sort((x, y) => x.completedAt - y.completedAt);
    let ratings = {};
    for (const item of list) {
      ratings = applyCompletionToRatings(ratings, item.skillsUsed, item.importance);
    }
    if (Object.keys(ratings).length === 0) continue;
    const name = (employeeMap.get(uid) || managerMap.get(uid))?.displayName || uid;
    if (isEmployee(uid)) {
      await db.collection("employeeProfiles").doc(uid).update({ skillRatings: ratings, updatedAt: Date.now() });
    } else {
      await db.collection("managers").doc(uid).update({ skillRatings: ratings, updatedAt: Date.now() });
    }
    const top = Object.entries(ratings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([s, r]) => `${s}: ${r}`)
      .join(", ");
    console.log(name, "->", top);
  }

  for (const e of employees) {
    const uid = e.id;
    if (completedByAssignee[uid]) continue;
    const skills = e.skills && Array.isArray(e.skills) ? e.skills : [];
    if (skills.length === 0) continue;
    const ratings = (e.skillRatings && typeof e.skillRatings === "object") ? { ...e.skillRatings } : {};
    for (const s of skills) if (ratings[s] == null) ratings[s] = DEFAULT_ELO;
    if (Object.keys(ratings).length > 0) {
      await db.collection("employeeProfiles").doc(uid).update({ skillRatings: ratings, updatedAt: Date.now() });
      console.log(e.displayName || uid, "-> initial ratings for", skills.join(", "));
    }
  }

  console.log("\nDone. Skill ratings are now coherent with project history (varied Elo).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
