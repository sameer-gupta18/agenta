#!/usr/bin/env node
/**
 * 1. Adds assignments for some managers (assigned by their manager) so not all work is only for employees.
 * 2. Ensures all assignments have varied skillsUsed (different per project).
 * 3. Recomputes skillRatings from completed work so ELO values differ (not all 1500).
 * Run after: seed-dummy-data, seed-nested-managers. Requires GOOGLE_APPLICATION_CREDENTIALS.
 *
 * Usage: node scripts/seed-varied-data.js
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

function inferSkillsUsed(title, description) {
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
  if (/performance|optimize|query|pipeline|ci|cd/.test(text)) skills.push("Performance", "CI/CD", "DevOps");
  if (/graphql|api layer/.test(text)) skills.push("GraphQL", "API design");
  if (/a\/b|experiment|analytics/.test(text)) skills.push("Analytics", "A/B testing", "Data");
  if (skills.length === 0) skills.push("Project delivery", "Collaboration");
  return [...new Set(skills)];
}

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

function toMs(v) {
  if (typeof v === "number") return v;
  if (v && typeof v.toMillis === "function") return v.toMillis();
  return 0;
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

  const [managersSnap, employeesSnap, assignmentsSnap] = await Promise.all([
    db.collection("managers").get(),
    db.collection("employeeProfiles").get(),
    db.collection("projectAssignments").get(),
  ]);

  const managers = managersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const employees = employeesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const assignments = assignmentsSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: toMs(data.createdAt),
      completedAt: data.completedAt != null ? toMs(data.completedAt) : null,
    };
  });

  const managerById = new Map(managers.map((m) => [m.id, m]));
  const rootManager = managers.find((m) => !m.reportsTo);
  const managersWithBoss = managers.filter((m) => m.reportsTo && m.reportsTo !== m.id);

  // 1) Add a few tasks assigned TO managers (by their manager)
  const MANAGER_TASKS = [
    { title: "Q1 roadmap review", description: "Review and align Q1 engineering roadmap with product.", importance: "high", timeline: "ASAP" },
    { title: "Cross-team process doc", description: "Document handoff process between product and engineering.", importance: "medium", timeline: "2025-02-28" },
    { title: "Ops runbook update", description: "Update incident runbook and escalation paths.", importance: "high", timeline: "2025-02-20" },
  ];
  let added = 0;
  for (let i = 0; i < Math.min(managersWithBoss.length, MANAGER_TASKS.length); i++) {
    const m = managersWithBoss[i];
    const task = MANAGER_TASKS[i];
    const parent = managerById.get(m.reportsTo);
    if (!parent) continue;
    await db.collection("projectAssignments").add({
      title: task.title,
      description: task.description,
      importance: task.importance,
      timeline: task.timeline,
      assignedBy: parent.id,
      assignedByName: parent.displayName || "Manager",
      assignedTo: m.id,
      assignedToName: m.displayName || "Manager",
      status: i === 0 ? "completed" : "pending",
      skillsUsed: inferSkillsUsed(task.title, task.description),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: i === 0 ? Date.now() - 86400000 : null,
    });
    added++;
    console.log("Manager task:", task.title, "→", m.displayName, "(assigned by", parent.displayName + ")");
  }

  // Add a task assigned TO the root manager (e.g. Alex Rivera) so it's visible on their bio
  if (rootManager && managers.length >= 2) {
    const assigner = managers[1];
    await db.collection("projectAssignments").add({
      title: "Executive alignment review",
      description: "Review Q1 priorities and align with leadership.",
      importance: "high",
      timeline: "ASAP",
      assignedBy: assigner.id,
      assignedByName: assigner.displayName || "Manager",
      assignedTo: rootManager.id,
      assignedToName: rootManager.displayName || "Manager",
      status: "pending",
      skillsUsed: ["Leadership", "Strategy", "Collaboration"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
    });
    added++;
    console.log("Manager task (root): Executive alignment review →", rootManager.displayName, "(assigned by", assigner.displayName + ")");
  }
  if (added > 0) console.log("Added", added, "assignments for managers.\n");

  // Re-fetch assignments so we have the new ones
  const allAssignmentsSnap = await db.collection("projectAssignments").get();
  const allAssignments = allAssignmentsSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: toMs(data.createdAt),
      completedAt: data.completedAt != null ? toMs(data.completedAt) : null,
    };
  });

  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  // 2) Ensure every assignment has varied skillsUsed
  for (const a of allAssignments) {
    const skillsUsed = a.skillsUsed && Array.isArray(a.skillsUsed) && a.skillsUsed.length > 0
      ? a.skillsUsed
      : inferSkillsUsed(a.title, a.description);
    await db.collection("projectAssignments").doc(a.id).update({ skillsUsed, updatedAt: Date.now() });
  }
  console.log("Updated all assignments with skillsUsed.\n");

  // 3) Recompute skillRatings from completed work (employees + managers) so ELO differs
  const completedByAssignee = {};
  for (const a of allAssignments) {
    if (a.status !== "completed") continue;
    const uid = a.assignedTo;
    if (!uid) continue;
    const skillsUsed = a.skillsUsed && Array.isArray(a.skillsUsed) && a.skillsUsed.length > 0
      ? a.skillsUsed
      : inferSkillsUsed(a.title, a.description);
    const completedAt = a.completedAt || a.createdAt || Date.now();
    if (!completedByAssignee[uid]) completedByAssignee[uid] = [];
    completedByAssignee[uid].push({
      importance: a.importance || "medium",
      skillsUsed,
      completedAt,
    });
  }

  for (const uid of Object.keys(completedByAssignee)) {
    const list = completedByAssignee[uid];
    list.sort((x, y) => x.completedAt - y.completedAt);
    let ratings = {};
    for (const item of list) {
      ratings = applyCompletionToRatings(ratings, item.skillsUsed, item.importance);
    }
    if (Object.keys(ratings).length === 0) continue;
    const isEmployee = employeeMap.has(uid);
    const name = (employeeMap.get(uid) || managerById.get(uid))?.displayName || uid;
    if (isEmployee) {
      await db.collection("employeeProfiles").doc(uid).update({ skillRatings: ratings, updatedAt: Date.now() });
    } else {
      await db.collection("managers").doc(uid).update({ skillRatings: ratings, updatedAt: Date.now() });
    }
    const top = Object.entries(ratings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([s, r]) => `${s}: ${r}`)
      .join(", ");
    console.log(name, "→", top);
  }

  // 4) Employees with no completed work: seed initial ratings from their bio skills (varied slightly)
  for (const e of employees) {
    const uid = e.id;
    if (completedByAssignee[uid]) continue;
    const skills = e.skills && Array.isArray(e.skills) ? e.skills : [];
    if (skills.length === 0) continue;
    const ratings = {};
    for (const s of skills) ratings[s] = DEFAULT_ELO + Math.floor((Math.random() - 0.5) * 80);
    await db.collection("employeeProfiles").doc(uid).update({ skillRatings: ratings, updatedAt: Date.now() });
    console.log(e.displayName || uid, "→ initial varied ratings", Object.keys(ratings).join(", "));
  }

  console.log("\nDone. Varied skills, manager tasks, and ELO differences applied.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
