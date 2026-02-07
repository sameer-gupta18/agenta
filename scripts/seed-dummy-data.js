#!/usr/bin/env node
/**
 * Seeds Firestore and Firebase Auth with dummy managers, employees, and project assignments.
 * Requires GOOGLE_APPLICATION_CREDENTIALS (and .env / .env.example). Enable Email/Password in Firebase Auth first.
 *
 * Usage: npm run seed-dummy-data   or   node scripts/seed-dummy-data.js
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

const DUMMY_PASSWORD = "password123";

const DUMMY_MANAGERS = [
  { email: "manager1@demo.com", displayName: "Alex Rivera", position: "Engineering Lead", gender: "Other", dateOfBirth: "1988-05-12", qualifications: ["PMP", "CSM"], education: ["B.S. Computer Science", "M.B.A."], department: "Engineering", phone: "+1 555-0101", agenticEvolution: 0.72, bio: "Led teams at two startups." },
  { email: "manager2@demo.com", displayName: "Jordan Kim", position: "Product Manager", gender: "Female", dateOfBirth: "1992-11-03", qualifications: ["CSPO"], education: ["B.A. Economics", "M.S. HCI"], department: "Product", phone: "+1 555-0102", agenticEvolution: 0.58, bio: "Former designer turned PM." },
  { email: "manager3@demo.com", displayName: "Sam Chen", position: "Ops Director", gender: "Male", dateOfBirth: "1985-07-22", qualifications: ["ITIL", "Six Sigma"], education: ["B.S. Operations"], department: "Operations", phone: "+1 555-0103", agenticEvolution: 0.85, bio: "15 years in operations." },
  { email: "manager4@demo.com", displayName: "Taylor Reed", position: "Tech Lead", gender: "Non-binary", dateOfBirth: "1990-03-15", qualifications: ["AWS"], education: ["B.S. CS", "M.S. Software Eng"], department: "Engineering", phone: "+1 555-0104", agenticEvolution: 0.68, bio: "Ex-FAANG, focus on scale." },
  { email: "manager5@demo.com", displayName: "Jamie Foster", position: "Delivery Manager", gender: "Female", dateOfBirth: "1987-09-20", qualifications: ["PRINCE2"], education: ["B.A. Business", "M.B.A."], department: "Product", phone: "+1 555-0105", agenticEvolution: 0.61, bio: "Agile and delivery focus." },
];

const DUMMY_EMPLOYEES = [
  { email: "employee1@demo.com", displayName: "Casey Doe", managerIndex: 0, position: "Senior Developer", gender: "Non-binary", dateOfBirth: "1994-02-18", qualifications: ["AWS Certified"], education: ["B.S. Software Engineering"], department: "Engineering", skills: ["React", "Node.js"], agenticEvolution: 0.65 },
  { email: "employee2@demo.com", displayName: "Riley Smith", managerIndex: 0, position: "Frontend Dev", gender: "Female", dateOfBirth: "1996-09-05", qualifications: [], education: ["B.A. Design", "Bootcamp Full-Stack"], department: "Engineering", skills: ["React", "CSS"], agenticEvolution: 0.42 },
  { email: "employee3@demo.com", displayName: "Morgan Lee", managerIndex: 0, position: "QA Engineer", gender: "Male", dateOfBirth: "1991-12-10", qualifications: ["ISTQB"], education: ["B.S. Computer Science"], department: "Engineering", skills: ["Cypress", "Jest"], agenticEvolution: 0.78 },
  { email: "employee4@demo.com", displayName: "Quinn Jones", managerIndex: 1, position: "UX Engineer", gender: "Other", dateOfBirth: "1993-04-25", qualifications: [], education: ["M.S. HCI"], department: "Product", skills: ["Figma", "React"], agenticEvolution: 0.55 },
  { email: "employee5@demo.com", displayName: "Avery Brown", managerIndex: 1, position: "Backend Dev", gender: "Male", dateOfBirth: "1989-08-14", qualifications: ["GCP"], education: ["B.S. CS", "M.S. Distributed Systems"], department: "Engineering", skills: ["Go", "Postgres"], agenticEvolution: 0.88 },
  { email: "employee6@demo.com", displayName: "Parker Davis", managerIndex: 1, position: "Technical Writer", gender: "Female", dateOfBirth: "1990-01-30", qualifications: [], education: ["B.A. English", "Minor CS"], department: "Product", skills: ["API docs", "Markdown"], agenticEvolution: 0.38 },
  { email: "employee7@demo.com", displayName: "Blake Wilson", managerIndex: 2, position: "Security Analyst", gender: "Male", dateOfBirth: "1987-06-08", qualifications: ["CISSP", "CEH"], education: ["B.S. Cybersecurity"], department: "Operations", skills: ["Audit", "Pen testing"], agenticEvolution: 0.91 },
  { email: "employee8@demo.com", displayName: "Cameron Taylor", managerIndex: 2, position: "DevOps", gender: "Non-binary", dateOfBirth: "1995-10-20", qualifications: ["Kubernetes"], education: ["B.S. CS"], department: "Operations", skills: ["K8s", "Terraform"], agenticEvolution: 0.7 },
  { email: "employee9@demo.com", displayName: "Skyler Moore", managerIndex: 0, position: "Full-Stack Dev", gender: "Female", dateOfBirth: "1992-07-12", qualifications: [], education: ["B.S. CS"], department: "Engineering", skills: ["React", "Node.js", "PostgreSQL"], agenticEvolution: 0.6 },
  { email: "employee10@demo.com", displayName: "Drew Martinez", managerIndex: 1, position: "Product Analyst", gender: "Male", dateOfBirth: "1994-11-08", qualifications: [], education: ["B.A. Economics", "Data Bootcamp"], department: "Product", skills: ["SQL", "Analytics", "Figma"], agenticEvolution: 0.5 },
  { email: "employee11@demo.com", displayName: "Jordan Bell", managerIndex: 2, position: "Infra Engineer", gender: "Non-binary", dateOfBirth: "1988-04-22", qualifications: ["CKA"], education: ["B.S. CS"], department: "Operations", skills: ["Kubernetes", "Terraform", "AWS"], agenticEvolution: 0.82 },
  { email: "employee12@demo.com", displayName: "Reese Clark", managerIndex: 3, position: "Backend Developer", gender: "Female", dateOfBirth: "1995-01-30", qualifications: [], education: ["B.S. Software Eng"], department: "Engineering", skills: ["Java", "Spring", "Postgres"], agenticEvolution: 0.55 },
];

const DUMMY_ASSIGNMENTS = [
  { title: "API integration", description: "Integrate payment API with backend.", importance: "high", timeline: "ASAP", managerIndex: 0, employeeIndex: 0, status: "in_progress" },
  { title: "Dashboard redesign", description: "Update admin dashboard UI components.", importance: "medium", timeline: "2025-02-14", managerIndex: 0, employeeIndex: 1, status: "pending" },
  { title: "E2E tests", description: "Add Cypress E2E tests for checkout flow.", importance: "medium", timeline: "2025-02-20", managerIndex: 0, employeeIndex: 2, status: "completed" },
  { title: "Mobile responsive layout", description: "Make landing page responsive.", importance: "high", timeline: "ASAP", managerIndex: 1, employeeIndex: 3, status: "in_progress" },
  { title: "Database migration", description: "Run and verify Postgres migration.", importance: "critical", timeline: "2025-02-10", managerIndex: 1, employeeIndex: 4, status: "completed" },
  { title: "Docs update", description: "Update API documentation.", importance: "low", timeline: "2025-02-28", managerIndex: 1, employeeIndex: 5, status: "pending" },
  { title: "Security audit", description: "Review auth and permissions.", importance: "critical", timeline: "ASAP", managerIndex: 2, employeeIndex: 6, status: "in_progress" },
  { title: "Performance profiling", description: "Profile and optimize slow queries.", importance: "medium", timeline: "2025-02-18", managerIndex: 2, employeeIndex: 7, status: "pending" },
  { title: "GraphQL layer", description: "Add GraphQL API layer for mobile clients.", importance: "high", timeline: "2025-03-01", managerIndex: 0, employeeIndex: 8, status: "completed" },
  { title: "A/B test dashboard", description: "Build dashboard for A/B experiment results.", importance: "medium", timeline: "2025-02-25", managerIndex: 1, employeeIndex: 9, status: "completed" },
  { title: "CI/CD pipeline", description: "Extend pipeline with staging and rollback.", importance: "high", timeline: "ASAP", managerIndex: 2, employeeIndex: 10, status: "pending" },
];

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

  const auth = admin.auth();
  const db = admin.firestore();

  async function getOrCreateUser(email, password, displayName, role) {
    try {
      const existing = await auth.getUserByEmail(email);
      await auth.updateUser(existing.uid, { password, displayName });
      await db.collection("users").doc(existing.uid).set(
        { role, displayName, email, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      return existing.uid;
    } catch (e) {
      if (e.code === "auth/user-not-found") {
        const user = await auth.createUser({ email, password, displayName, emailVerified: true });
        await db.collection("users").doc(user.uid).set(
          { role, displayName, email, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
        return user.uid;
      }
      throw e;
    }
  }

  const managerUids = [];
  for (let i = 0; i < DUMMY_MANAGERS.length; i++) {
    const m = DUMMY_MANAGERS[i];
    const uid = await getOrCreateUser(m.email, DUMMY_PASSWORD, m.displayName, "manager");
    managerUids.push(uid);
    const age = m.dateOfBirth ? Math.floor((Date.now() - new Date(m.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : undefined;
    await db.collection("managers").doc(uid).set({
      uid,
      email: m.email,
      displayName: m.displayName,
      position: m.position,
      gender: m.gender,
      dateOfBirth: m.dateOfBirth,
      age,
      qualifications: m.qualifications || [],
      education: m.education || [],
      phone: m.phone,
      department: m.department,
      agenticEvolution: m.agenticEvolution ?? 0.5,
      lastAgentTrainedAt: Date.now() - 86400000 * 7,
      bio: m.bio,
      createdAt: Date.now(),
    });
    console.log("Manager:", m.displayName, uid);
  }

  const employeeUids = [];
  for (let i = 0; i < DUMMY_EMPLOYEES.length; i++) {
    const e = DUMMY_EMPLOYEES[i];
    const uid = await getOrCreateUser(e.email, DUMMY_PASSWORD, e.displayName, "employee");
    employeeUids.push(uid);
    const managerId = managerUids[e.managerIndex];
    const age = e.dateOfBirth ? Math.floor((Date.now() - new Date(e.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : undefined;
    await db.collection("employeeProfiles").doc(uid).set({
      uid,
      email: e.email,
      displayName: e.displayName,
      managerId,
      position: e.position,
      gender: e.gender,
      dateOfBirth: e.dateOfBirth,
      age,
      qualifications: e.qualifications || [],
      education: e.education || [],
      department: e.department,
      skills: e.skills || [],
      agenticEvolution: e.agenticEvolution ?? 0.5,
      lastAgentTrainedAt: Date.now() - 86400000 * 14,
      agentExperience: 0.3 + Math.random() * 0.5,
      agentTrustability: 0.5 + Math.random() * 0.4,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    console.log("Employee:", e.displayName, "→ manager", DUMMY_MANAGERS[e.managerIndex].displayName);
  }

  const managerNames = DUMMY_MANAGERS.map((m) => m.displayName);
  const employeeNames = DUMMY_EMPLOYEES.map((e) => e.displayName);

  for (const a of DUMMY_ASSIGNMENTS) {
    const assignedBy = managerUids[a.managerIndex];
    const assignedTo = employeeUids[a.employeeIndex];
    const doc = {
      title: a.title,
      description: a.description,
      importance: a.importance,
      timeline: a.timeline,
      assignedBy,
      assignedByName: managerNames[a.managerIndex],
      assignedTo,
      assignedToName: employeeNames[a.employeeIndex],
      status: a.status,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    if (a.status === "completed") doc.completedAt = Date.now() - 86400000;
    await db.collection("projectAssignments").add(doc);
    console.log("Assignment:", a.title, "→", employeeNames[a.employeeIndex]);
  }

  console.log("\nDone. Managers:", managerUids.length, "Employees:", employeeUids.length, "Assignments:", DUMMY_ASSIGNMENTS.length);
  console.log("All dummy accounts use password:", DUMMY_PASSWORD);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
