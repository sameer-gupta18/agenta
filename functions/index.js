const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

/**
 * Callable only by authenticated users with role "manager".
 * Creates a new Firebase Auth user (employee) and Firestore users + employeeProfiles.
 * Data: { email: string, password: string, displayName: string }
 */
exports.createEmployee = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const callerUid = context.auth.uid;
  const db = admin.firestore();

  const callerDoc = await db.collection("users").doc(callerUid).get();
  const role = callerDoc.exists ? callerDoc.data().role : null;
  if (role !== "manager") {
    throw new functions.https.HttpsError("permission-denied", "Only managers can create employees.");
  }

  const { email, password, displayName } = data || {};
  if (!email || typeof email !== "string" || !password || typeof password !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "email and password are required.");
  }
  if (password.length < 6) {
    throw new functions.https.HttpsError("invalid-argument", "Password must be at least 6 characters.");
  }
  const name = typeof displayName === "string" && displayName.trim() ? displayName.trim() : email.split("@")[0];

  let user;
  try {
    user = await admin.auth().createUser({
      email: email.trim(),
      password,
      displayName: name,
      emailVerified: false,
    });
  } catch (e) {
    if (e.code === "auth/email-already-exists") {
      throw new functions.https.HttpsError("already-exists", "An account with this email already exists.");
    }
    throw new functions.https.HttpsError("internal", e.message);
  }

  const uid = user.uid;
  const batch = db.batch();

  batch.set(db.collection("users").doc(uid), {
    role: "employee",
    displayName: name,
    email: email.trim(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  batch.set(db.collection("employeeProfiles").doc(uid), {
    uid,
    email: email.trim(),
    displayName: name,
    managerId: callerUid,
    agentExperience: 0,
    agentTrustability: 0.5,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  await batch.commit();

  return { uid, email: email.trim(), displayName: name };
});

/**
 * Callable only by authenticated users with role "admin".
 * Promotes an employee to manager: sets user role to manager and creates managers doc.
 * Data: { uid: string } (employee uid)
 */
exports.promoteEmployeeToManager = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const callerUid = context.auth.uid;
  const db = admin.firestore();

  const callerDoc = await db.collection("users").doc(callerUid).get();
  const role = callerDoc.exists ? callerDoc.data().role : null;
  if (role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Only admins can promote employees to manager.");
  }

  const uid = data?.uid;
  if (!uid || typeof uid !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "uid is required.");
  }

  const empSnap = await db.collection("employeeProfiles").doc(uid).get();
  if (!empSnap.exists()) {
    throw new functions.https.HttpsError("failed-precondition", "User is not an employee (no employee profile).");
  }
  const emp = empSnap.data();

  await db.collection("users").doc(uid).set({
    role: "manager",
    displayName: emp.displayName,
    email: emp.email,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const managerSnap = await db.collection("managers").doc(uid).get();
  if (!managerSnap.exists()) {
    await db.collection("managers").doc(uid).set({
      uid,
      email: emp.email,
      displayName: emp.displayName,
      position: emp.position,
      department: emp.department,
      phone: emp.phone,
      qualifications: emp.qualifications,
      education: emp.education,
      bio: emp.bio,
      createdAt: Date.now(),
    });
  }

  return { uid, email: emp.email, displayName: emp.displayName };
});
