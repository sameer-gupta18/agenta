const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

/**
 * Callable only by authenticated users with role "admin".
 * Creates a new Firebase Auth user (employee) and Firestore users + employeeProfiles.
 * Admin must provide managerId, position, and department.
 * Data: { email: string, password: string, displayName: string, managerId: string, position: string, department: string }
 */
exports.createEmployee = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const callerUid = context.auth.uid;
  const db = admin.firestore();

  const callerDoc = await db.collection("users").doc(callerUid).get();
  const role = callerDoc.exists ? callerDoc.data().role : null;
  if (role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Only the admin can create employees.");
  }

  const { email, password, displayName, managerId, position, department } = data || {};
  if (!email || typeof email !== "string" || !password || typeof password !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Email and password are required.");
  }
  if (!managerId || typeof managerId !== "string" || !managerId.trim()) {
    throw new functions.https.HttpsError("invalid-argument", "Manager is required.");
  }
  if (password.length < 6) {
    throw new functions.https.HttpsError("invalid-argument", "Password must be at least 6 characters.");
  }
  const name = typeof displayName === "string" && displayName.trim() ? displayName.trim() : email.split("@")[0];
  const emailNorm = email.trim().toLowerCase();
  const managerIdTrim = managerId.trim();
  const positionStr = typeof position === "string" && position.trim() ? position.trim() : "";
  const departmentStr = typeof department === "string" && department.trim() ? department.trim() : "";

  const managerDoc = await db.collection("users").doc(managerIdTrim).get();
  if (!managerDoc.exists || managerDoc.data().role !== "manager") {
    throw new functions.https.HttpsError("invalid-argument", "Selected manager is not valid.");
  }

  let user;
  try {
    user = await admin.auth().createUser({
      email: emailNorm,
      password,
      displayName: name,
      emailVerified: false,
    });
  } catch (e) {
    const code = e && e.code;
    if (code === "auth/email-already-exists") {
      throw new functions.https.HttpsError("already-exists", "An account with this email already exists.");
    }
    if (code === "auth/invalid-email") {
      throw new functions.https.HttpsError("invalid-argument", "Please enter a valid email address.");
    }
    if (code === "auth/operation-not-allowed") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Email/password sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method."
      );
    }
    if (code === "auth/weak-password" || code === "auth/invalid-password") {
      throw new functions.https.HttpsError("invalid-argument", "Password is too weak. Use at least 6 characters.");
    }
    functions.logger.error("createEmployee auth error", { code: code, message: e && e.message });
    const msg = (e && e.message) ? String(e.message) : "Could not create account. Try a different email or enable Email/Password in Firebase Console.";
    throw new functions.https.HttpsError("internal", msg);
  }

  const uid = user.uid;
  const now = Date.now();

  const baseProfile = {
    uid,
    email: emailNorm,
    displayName: name,
    managerId: managerIdTrim,
    position: positionStr,
    department: departmentStr,
    agentExperience: 0,
    agentTrustability: 0.5,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const batch = db.batch();

    batch.set(db.collection("users").doc(uid), {
      role: "employee",
      displayName: name,
      email: emailNorm,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    batch.set(db.collection("employeeProfiles").doc(uid), baseProfile, { merge: true });

    await batch.commit();
  } catch (e) {
    functions.logger.error("createEmployee firestore error", { message: e && e.message });
    if (user) {
      try {
        await admin.auth().deleteUser(uid);
      } catch (delErr) {
        functions.logger.warn("createEmployee rollback deleteUser failed", delErr);
      }
    }
    const msg = (e && e.message) ? String(e.message) : "Account was created but saving profile failed. Check Firebase Console → Firestore rules and try again.";
    throw new functions.https.HttpsError("internal", msg);
  }

  return { uid, email: emailNorm, displayName: name };
});

/**
 * Callable only by authenticated users with role "admin".
 * Removes a person (employee or manager) from the system: deletes Auth user and Firestore docs.
 * Data: { uid: string }
 */
exports.firePerson = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const callerUid = context.auth.uid;
  const db = admin.firestore();

  const callerDoc = await db.collection("users").doc(callerUid).get();
  const role = callerDoc.exists ? callerDoc.data().role : null;
  if (role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Only the admin can remove people from the system.");
  }

  const uid = data && typeof data.uid === "string" ? data.uid.trim() : null;
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "Person ID is required.");
  }
  if (uid === callerUid) {
    throw new functions.https.HttpsError("invalid-argument", "You cannot remove yourself.");
  }

  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Person not found.");
  }
  const personRole = userDoc.data().role;
  if (personRole === "admin") {
    throw new functions.https.HttpsError("permission-denied", "Cannot remove another admin.");
  }

  try {
    await admin.auth().deleteUser(uid);
  } catch (e) {
    if (e && e.code === "auth/user-not-found") {
      // Proceed to delete Firestore docs
    } else {
      functions.logger.error("firePerson deleteUser error", { message: e && e.message });
      throw new functions.https.HttpsError("internal", (e && e.message) ? String(e.message) : "Could not remove user account.");
    }
  }

  const batch = db.batch();
  batch.delete(db.collection("users").doc(uid));
  if (personRole === "employee") {
    batch.delete(db.collection("employeeProfiles").doc(uid));
  } else if (personRole === "manager") {
    batch.delete(db.collection("managers").doc(uid));
  }
  await batch.commit();

  return { ok: true };
});

/**
 * Callable by anyone with a valid employee invite token (no auth required).
 * Completes employee self-registration: validates invite, creates Auth user + users + employeeProfiles.
 * Data: { employeeInvite: string, email: string, password: string, displayName: string, profile?: object }
 */
exports.completeEmployeeSignup = functions.https.onCall(async (data, context) => {
  const db = admin.firestore();
  const { employeeInvite: token, email, password, displayName, profile: profileInput } = data || {};
  if (!token || typeof token !== "string" || !email || typeof email !== "string" || !password || typeof password !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Invite token, email and password are required.");
  }
  if (password.length < 6) {
    throw new functions.https.HttpsError("invalid-argument", "Password must be at least 6 characters.");
  }

  const inviteSnap = await db.collection("employeeInvites").doc(token).get();
  if (!inviteSnap.exists()) {
    throw new functions.https.HttpsError("not-found", "This invite link is invalid or has expired.");
  }
  const invite = inviteSnap.data();
  if (invite.used) {
    throw new functions.https.HttpsError("failed-precondition", "This invite link has already been used.");
  }
  const expiresAt = invite.expiresAt && (invite.expiresAt.toMillis ? invite.expiresAt.toMillis() : invite.expiresAt);
  if (expiresAt && Date.now() > expiresAt) {
    throw new functions.https.HttpsError("failed-precondition", "This invite link has expired.");
  }
  const managerId = invite.createdBy;
  if (!managerId) {
    throw new functions.https.HttpsError("internal", "Invalid invite data.");
  }

  const name = typeof displayName === "string" && displayName.trim() ? displayName.trim() : email.split("@")[0];
  const emailNorm = email.trim().toLowerCase();
  const now = Date.now();

  const baseProfile = {
    uid: null,
    email: emailNorm,
    displayName: name,
    managerId,
    agentExperience: 0,
    agentTrustability: 0.5,
    createdAt: now,
    updatedAt: now,
  };
  if (invite.position) baseProfile.position = invite.position;
  if (invite.department) baseProfile.department = invite.department;

  if (profileInput && typeof profileInput === "object") {
    const p = profileInput;
    if (typeof p.position === "string" && p.position.trim()) baseProfile.position = p.position.trim();
    if (typeof p.department === "string" && p.department.trim()) baseProfile.department = p.department.trim();
    if (typeof p.phone === "string" && p.phone.trim()) baseProfile.phone = p.phone.trim();
    if (typeof p.bio === "string" && p.bio.trim()) baseProfile.bio = p.bio.trim();
    if (Array.isArray(p.education) && p.education.length) baseProfile.education = p.education.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
    if (Array.isArray(p.qualifications) && p.qualifications.length) baseProfile.qualifications = p.qualifications.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
    if (Array.isArray(p.skills) && p.skills.length) baseProfile.skills = p.skills.slice(0, 6).filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
    if (typeof p.experience === "string" && p.experience.trim()) baseProfile.experience = p.experience.trim();
    if (typeof p.workEx === "string" && p.workEx.trim()) baseProfile.workEx = p.workEx.trim();
    if (typeof p.resume === "string" && p.resume.trim()) baseProfile.resume = p.resume.trim();
  }

  let user;
  try {
    user = await admin.auth().createUser({
      email: emailNorm,
      password,
      displayName: name,
      emailVerified: false,
    });
  } catch (e) {
    const code = e && e.code;
    if (code === "auth/email-already-exists") {
      throw new functions.https.HttpsError("already-exists", "An account with this email already exists.");
    }
    if (code === "auth/invalid-email") {
      throw new functions.https.HttpsError("invalid-argument", "Please enter a valid email address.");
    }
    if (code === "auth/operation-not-allowed") {
      throw new functions.https.HttpsError("failed-precondition", "Email/password sign-in is not enabled. Ask your manager or enable it in Firebase Console.");
    }
    if (code === "auth/weak-password" || code === "auth/invalid-password") {
      throw new functions.https.HttpsError("invalid-argument", "Password is too weak. Use at least 6 characters.");
    }
    functions.logger.error("completeEmployeeSignup auth error", { code: code, message: e && e.message });
    throw new functions.https.HttpsError("internal", (e && e.message) ? String(e.message) : "Could not create account.");
  }

  const uid = user.uid;
  baseProfile.uid = uid;

  try {
    const batch = db.batch();
    batch.set(db.collection("users").doc(uid), {
      role: "employee",
      displayName: name,
      email: emailNorm,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    batch.set(db.collection("employeeProfiles").doc(uid), baseProfile, { merge: true });
    batch.update(db.collection("employeeInvites").doc(token), { used: true });
    await batch.commit();
  } catch (e) {
    functions.logger.error("completeEmployeeSignup firestore error", { message: e && e.message });
    try {
      await admin.auth().deleteUser(uid);
    } catch (delErr) {
      functions.logger.warn("completeEmployeeSignup rollback deleteUser failed", delErr);
    }
    throw new functions.https.HttpsError("internal", (e && e.message) ? String(e.message) : "Account creation failed.");
  }

  return { uid, email: emailNorm, displayName: name };
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
