import { Effect, Context, Layer } from "effect";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { getFirebaseDb } from "../../config/firebase";
import type {
  EmployeeProfile,
  ProjectAssignment,
  Role,
  ManagerInvite,
  ManagerRecord,
  Notification,
  NotificationType,
} from "../../types";

export type FirestoreError = { message: string };
export const FirestoreError = Context.GenericTag<FirestoreError>("FirestoreError");

const db = () => getFirebaseDb();

function toFirestoreError(e: unknown): FirestoreError {
  return {
    message: e instanceof Error ? e.message : "Firestore error",
  };
}

function toMillisOrNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "toMillis" in v && typeof (v as { toMillis: () => number }).toMillis === "function")
    return (v as { toMillis: () => number }).toMillis();
  return 0;
}

function normalizeManagerDoc(id: string, data: Record<string, unknown>): ManagerRecord {
  const createdAt = toMillisOrNum(data?.createdAt);
  const quals = data?.qualifications;
  const educ = data?.education;
  return {
    uid: id,
    email: (data?.email as string) ?? "",
    displayName: (data?.displayName as string) ?? "",
    createdAt,
    position: data?.position as string | undefined,
    gender: data?.gender as string | undefined,
    dateOfBirth: data?.dateOfBirth as string | undefined,
    age: data?.age as number | undefined,
    qualifications: Array.isArray(quals) ? (quals as string[]) : undefined,
    education: Array.isArray(educ) ? (educ as string[]) : undefined,
    phone: data?.phone as string | undefined,
    department: data?.department as string | undefined,
    agenticEvolution: data?.agenticEvolution as number | undefined,
    lastAgentTrainedAt: data?.lastAgentTrainedAt as number | undefined,
    bio: data?.bio as string | undefined,
    reportsTo: data?.reportsTo as string | undefined,
    skillRatings: (data?.skillRatings && typeof data.skillRatings === "object") ? (data.skillRatings as Record<string, number>) : undefined,
  };
}

function normalizeAssignmentDoc(id: string, data: Record<string, unknown>): ProjectAssignment {
  return {
    id,
    title: (data?.title as string) ?? "",
    description: (data?.description as string) ?? "",
    importance: (data?.importance as ProjectAssignment["importance"]) ?? "medium",
    timeline: (data?.timeline as string) ?? "",
    deadline: typeof data?.deadline === "number" ? data.deadline : undefined,
    skillsRequired: Array.isArray(data?.skillsRequired) ? (data.skillsRequired as string[]) : undefined,
    assignedBy: (data?.assignedBy as string) ?? "",
    assignedByName: (data?.assignedByName as string) ?? "",
    assignedTo: (data?.assignedTo as string) ?? "",
    assignedToName: (data?.assignedToName as string) ?? "",
    skillsUsed: Array.isArray(data?.skillsUsed) ? (data.skillsUsed as string[]) : undefined,
    trainingForLowerLevel: data?.trainingForLowerLevel === true,
    status: (data?.status as ProjectAssignment["status"]) ?? "pending",
    createdAt: toMillisOrNum(data?.createdAt),
    updatedAt: toMillisOrNum(data?.updatedAt),
    completedAt: data?.completedAt !== undefined && data?.completedAt !== null ? toMillisOrNum(data.completedAt) : undefined,
  };
}

function normalizeEmployeeDoc(id: string, data: Record<string, unknown>): EmployeeProfile {
  const createdAt = toMillisOrNum(data?.createdAt);
  const updatedAt = toMillisOrNum(data?.updatedAt);
  const quals = data?.qualifications;
  const educ = data?.education;
  return {
    uid: id,
    email: (data?.email as string) ?? "",
    displayName: (data?.displayName as string) ?? "",
    managerId: (data?.managerId as string) ?? "",
    createdAt,
    updatedAt,
    resume: data?.resume as string | undefined,
    experience: data?.experience as string | undefined,
    workEx: data?.workEx as string | undefined,
    skills: Array.isArray(data?.skills) ? (data.skills as string[]) : undefined,
    position: data?.position as string | undefined,
    gender: data?.gender as string | undefined,
    dateOfBirth: data?.dateOfBirth as string | undefined,
    age: data?.age as number | undefined,
    qualifications: Array.isArray(quals) ? (quals as string[]) : undefined,
    education: Array.isArray(educ) ? (educ as string[]) : undefined,
    phone: data?.phone as string | undefined,
    department: data?.department as string | undefined,
    agenticEvolution: data?.agenticEvolution as number | undefined,
    lastAgentTrainedAt: data?.lastAgentTrainedAt as number | undefined,
    bio: data?.bio as string | undefined,
    skillRatings: (data?.skillRatings && typeof data.skillRatings === "object") ? (data.skillRatings as Record<string, number>) : undefined,
  };
}

function normalizeNotificationDoc(id: string, data: Record<string, unknown>): Notification {
  return {
    id,
    userId: (data?.userId as string) ?? "",
    type: (data?.type as NotificationType) ?? "update",
    title: (data?.title as string) ?? "",
    body: (data?.body as string) ?? "",
    read: Boolean(data?.read),
    createdAt: toMillisOrNum(data?.createdAt),
    metadata: data?.metadata && typeof data.metadata === "object" ? (data.metadata as Notification["metadata"]) : undefined,
  };
}

export interface FirestoreService {
  readonly setUserRole: (uid: string, role: Role, displayName: string, email: string) => Effect.Effect<void, FirestoreError>;
  readonly getEmployeeProfilesByManager: (managerId: string) => Effect.Effect<EmployeeProfile[], FirestoreError>;
  readonly getEmployeeProfile: (uid: string) => Effect.Effect<EmployeeProfile | null, FirestoreError>;
  readonly createEmployeeProfile: (profile: Omit<EmployeeProfile, "createdAt" | "updatedAt">) => Effect.Effect<void, FirestoreError>;
  readonly updateEmployeeProfile: (uid: string, partial: Partial<Omit<EmployeeProfile, "uid" | "managerId" | "createdAt">>) => Effect.Effect<void, FirestoreError>;
  readonly createProjectAssignment: (assignment: Omit<ProjectAssignment, "createdAt" | "updatedAt">) => Effect.Effect<string, FirestoreError>;
  readonly getAssignmentsByEmployee: (employeeId: string) => Effect.Effect<ProjectAssignment[], FirestoreError>;
  readonly getAssignmentsByManager: (managerId: string) => Effect.Effect<ProjectAssignment[], FirestoreError>;
  /** Tasks assigned to this person (employee or manager). */
  readonly getAssignmentsAssignedTo: (uid: string) => Effect.Effect<ProjectAssignment[], FirestoreError>;
  readonly getAssignment: (id: string) => Effect.Effect<ProjectAssignment | null, FirestoreError>;
  readonly updateAssignmentStatus: (id: string, status: ProjectAssignment["status"], completedAt?: number) => Effect.Effect<void, FirestoreError>;
  readonly updateAssignmentDelegate: (id: string, assignedTo: string, assignedToName: string) => Effect.Effect<void, FirestoreError>;
  readonly updateAssignmentSkillsUsed: (id: string, skillsUsed: string[]) => Effect.Effect<void, FirestoreError>;
  readonly createManagerInvite: (token: string, createdBy: string, expiresAt: number, reportsTo?: string | null, reportsToDisplayName?: string, position?: string, department?: string) => Effect.Effect<void, FirestoreError>;
  readonly getManagerInvite: (token: string) => Effect.Effect<ManagerInvite | null, FirestoreError>;
  readonly markManagerInviteUsed: (token: string) => Effect.Effect<void, FirestoreError>;
  readonly getManagers: () => Effect.Effect<ManagerRecord[], FirestoreError>;
  readonly getManager: (uid: string) => Effect.Effect<ManagerRecord | null, FirestoreError>;
  readonly getPersonRole: (uid: string) => Effect.Effect<Role | null, FirestoreError>;
  readonly setManagerRecord: (uid: string, data: Partial<ManagerRecord> & { email: string; displayName: string }) => Effect.Effect<void, FirestoreError>;
  readonly updateManagerRecord: (uid: string, partial: Partial<ManagerRecord>) => Effect.Effect<void, FirestoreError>;
  readonly getAllEmployeeProfiles: () => Effect.Effect<EmployeeProfile[], FirestoreError>;
  readonly getAllAssignments: () => Effect.Effect<ProjectAssignment[], FirestoreError>;
  readonly createNotification: (n: Omit<Notification, "id" | "createdAt"> & { read?: boolean }) => Effect.Effect<string, FirestoreError>;
  readonly subscribeNotifications: (userId: string, callback: (list: Notification[]) => void) => Effect.Effect<() => void, FirestoreError>;
  readonly markNotificationRead: (id: string) => Effect.Effect<void, FirestoreError>;
  readonly getAllUserIds: () => Effect.Effect<string[], FirestoreError>;
  readonly createGlobalNotification: (title: string, body: string) => Effect.Effect<void, FirestoreError>;
}

export const FirestoreService = Context.GenericTag<FirestoreService>("FirestoreService"); // eslint-disable-line @typescript-eslint/no-redeclare

export const FirestoreServiceLive = Layer.succeed(FirestoreService, {
  setUserRole: (uid: string, role: Role, displayName: string, email: string) =>
    Effect.tryPromise({
      try: () =>
        setDoc(doc(db(), "users", uid), {
          role,
          displayName,
          email,
          updatedAt: serverTimestamp(),
        }, { merge: true }),
      catch: (e) => toFirestoreError(e),
    }),

  getEmployeeProfilesByManager: (managerId: string) =>
    Effect.tryPromise({
      try: async () => {
        const q = query(
          collection(db(), "employeeProfiles"),
          where("managerId", "==", managerId)
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => normalizeEmployeeDoc(d.id, d.data() as Record<string, unknown>));
      },
      catch: (e) => toFirestoreError(e),
    }),

  getEmployeeProfile: (uid: string) =>
    Effect.tryPromise({
      try: async () => {
        const ref = doc(db(), "employeeProfiles", uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        return normalizeEmployeeDoc(snap.id, snap.data() as Record<string, unknown>);
      },
      catch: (e) => toFirestoreError(e),
    }),

  createEmployeeProfile: (profile) =>
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () =>
          setDoc(doc(db(), "employeeProfiles", profile.uid), {
            ...profile,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
        catch: (e) => toFirestoreError(e),
      });
    }),

  updateEmployeeProfile: (uid: string, partial) =>
    Effect.tryPromise({
      try: () =>
        updateDoc(doc(db(), "employeeProfiles", uid), {
          ...partial,
          updatedAt: Date.now(),
        }),
      catch: (e) => toFirestoreError(e),
    }),

  createProjectAssignment: (assignment) =>
    Effect.tryPromise({
      try: async () => {
        const ref = await addDoc(collection(db(), "projectAssignments"), {
          ...assignment,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        return ref.id;
      },
      catch: (e) => toFirestoreError(e),
    }),

  getAssignmentsByEmployee: (employeeId: string) =>
    Effect.tryPromise({
      try: async () => {
        const q = query(
          collection(db(), "projectAssignments"),
          where("assignedTo", "==", employeeId)
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => normalizeAssignmentDoc(d.id, d.data() as Record<string, unknown>));
        list.sort((a, b) => b.createdAt - a.createdAt);
        return list.slice(0, 50);
      },
      catch: (e) => toFirestoreError(e),
    }),

  getAssignmentsByManager: (managerId: string) =>
    Effect.tryPromise({
      try: async () => {
        const q = query(
          collection(db(), "projectAssignments"),
          where("assignedBy", "==", managerId)
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => normalizeAssignmentDoc(d.id, d.data() as Record<string, unknown>));
        list.sort((a, b) => b.createdAt - a.createdAt);
        return list.slice(0, 100);
      },
      catch: (e) => toFirestoreError(e),
    }),

  getAssignmentsAssignedTo: (uid: string) =>
    Effect.tryPromise({
      try: async () => {
        const q = query(
          collection(db(), "projectAssignments"),
          where("assignedTo", "==", uid)
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => normalizeAssignmentDoc(d.id, d.data() as Record<string, unknown>));
        list.sort((a, b) => b.createdAt - a.createdAt);
        return list.slice(0, 100);
      },
      catch: (e) => toFirestoreError(e),
    }),

  getAssignment: (id: string) =>
    Effect.tryPromise({
      try: async () => {
        const ref = doc(db(), "projectAssignments", id);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        const data = snap.data() as Record<string, unknown>;
        return normalizeAssignmentDoc(snap.id, data);
      },
      catch: (e) => toFirestoreError(e),
    }),

  updateAssignmentStatus: (id: string, status: ProjectAssignment["status"], completedAt?: number) =>
    Effect.tryPromise({
      try: () =>
        updateDoc(doc(db(), "projectAssignments", id), {
          status,
          updatedAt: Date.now(),
          ...(completedAt !== undefined ? { completedAt } : {}),
        }),
      catch: (e) => toFirestoreError(e),
    }),

  updateAssignmentDelegate: (id: string, assignedTo: string, assignedToName: string) =>
    Effect.tryPromise({
      try: () =>
        updateDoc(doc(db(), "projectAssignments", id), {
          assignedTo,
          assignedToName,
          updatedAt: Date.now(),
        }),
      catch: (e) => toFirestoreError(e),
    }),

  updateAssignmentSkillsUsed: (id: string, skillsUsed: string[]) =>
    Effect.tryPromise({
      try: () =>
        updateDoc(doc(db(), "projectAssignments", id), {
          skillsUsed,
          updatedAt: Date.now(),
        }),
      catch: (e) => toFirestoreError(e),
    }),

  createManagerInvite: (token: string, createdBy: string, expiresAt: number, reportsTo?: string | null, reportsToDisplayName?: string, position?: string, department?: string) =>
    Effect.tryPromise({
      try: () =>
        setDoc(doc(db(), "managerInvites", token), {
          token,
          createdBy,
          createdAt: Date.now(),
          expiresAt,
          used: false,
          ...(reportsTo !== undefined && reportsTo !== null && { reportsTo }),
          ...(reportsToDisplayName && { reportsToDisplayName }),
          ...(position !== undefined && position.trim() !== "" && { position: position.trim() }),
          ...(department !== undefined && department.trim() !== "" && { department: department.trim() }),
        }),
      catch: (e) => toFirestoreError(e),
    }),

  getManagerInvite: (token: string) =>
    Effect.tryPromise({
      try: async () => {
        const ref = doc(db(), "managerInvites", token);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        const data = snap.data();
        return {
          token: snap.id,
          createdBy: data?.createdBy ?? "",
          createdAt: (data?.createdAt?.toMillis?.() ?? data?.createdAt) ?? 0,
          expiresAt: (data?.expiresAt?.toMillis?.() ?? data?.expiresAt) ?? 0,
          used: data?.used ?? false,
          email: data?.email,
          reportsTo: data?.reportsTo ?? undefined,
          reportsToDisplayName: data?.reportsToDisplayName ?? undefined,
          position: data?.position ?? undefined,
          department: data?.department ?? undefined,
        } as ManagerInvite;
      },
      catch: (e) => toFirestoreError(e),
    }),

  markManagerInviteUsed: (token: string) =>
    Effect.tryPromise({
      try: () =>
        updateDoc(doc(db(), "managerInvites", token), { used: true }),
      catch: (e) => toFirestoreError(e),
    }),

  getManagers: () =>
    Effect.tryPromise({
      try: async () => {
        const snap = await getDocs(collection(db(), "managers"));
        return snap.docs.map((d) => normalizeManagerDoc(d.id, d.data()));
      },
      catch: (e) => toFirestoreError(e),
    }),

  getManager: (uid: string) =>
    Effect.tryPromise({
      try: async () => {
        const ref = doc(db(), "managers", uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        return normalizeManagerDoc(snap.id, snap.data() as Record<string, unknown>);
      },
      catch: (e) => toFirestoreError(e),
    }),

  getPersonRole: (uid: string) =>
    Effect.tryPromise({
      try: async () => {
        const ref = doc(db(), "users", uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        const role = snap.data()?.role as Role | undefined;
        return role === "admin" || role === "manager" || role === "employee" ? role : null;
      },
      catch: (e) => toFirestoreError(e),
    }),

  setManagerRecord: (uid: string, data: Partial<ManagerRecord> & { email: string; displayName: string }) =>
    Effect.tryPromise({
      try: () =>
        setDoc(doc(db(), "managers", uid), {
          uid,
          email: data.email,
          displayName: data.displayName,
          ...(data.position !== undefined && { position: data.position }),
          ...(data.gender !== undefined && { gender: data.gender }),
          ...(data.dateOfBirth !== undefined && { dateOfBirth: data.dateOfBirth }),
          ...(data.age !== undefined && { age: data.age }),
          ...(data.qualifications !== undefined && { qualifications: data.qualifications }),
          ...(data.education !== undefined && { education: data.education }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.department !== undefined && { department: data.department }),
          ...(data.agenticEvolution !== undefined && { agenticEvolution: data.agenticEvolution }),
          ...(data.lastAgentTrainedAt !== undefined && { lastAgentTrainedAt: data.lastAgentTrainedAt }),
          ...(data.bio !== undefined && { bio: data.bio }),
          ...(data.reportsTo !== undefined && { reportsTo: data.reportsTo }),
          createdAt: Date.now(),
        }),
      catch: (e) => toFirestoreError(e),
    }),

  updateManagerRecord: (uid: string, partial: Partial<ManagerRecord>) =>
    Effect.tryPromise({
      try: () => {
        const updates: Record<string, unknown> = { updatedAt: Date.now() };
        Object.entries(partial).forEach(([k, v]) => { if (v !== undefined) updates[k] = v; });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
return updateDoc(doc(db(), "managers", uid), updates as any);
      },
      catch: (e) => toFirestoreError(e),
    }),

  getAllEmployeeProfiles: () =>
    Effect.tryPromise({
      try: async () => {
        const snap = await getDocs(collection(db(), "employeeProfiles"));
        return snap.docs.map((d) => normalizeEmployeeDoc(d.id, d.data() as Record<string, unknown>));
      },
      catch: (e) => toFirestoreError(e),
    }),

  getAllAssignments: () =>
    Effect.tryPromise({
      try: async () => {
        const snap = await getDocs(collection(db(), "projectAssignments"));
        const list = snap.docs.map((d) => normalizeAssignmentDoc(d.id, d.data() as Record<string, unknown>));
        list.sort((a, b) => b.createdAt - a.createdAt);
        return list.slice(0, 300);
      },
      catch: (e) => toFirestoreError(e),
    }),

  createNotification: (n) =>
    Effect.tryPromise({
      try: async () => {
        const ref = await addDoc(collection(db(), "notifications"), {
          userId: n.userId,
          type: n.type,
          title: n.title,
          body: n.body,
          read: n.read ?? false,
          createdAt: Date.now(),
          ...(n.metadata && { metadata: n.metadata }),
        });
        return ref.id;
      },
      catch: (e) => toFirestoreError(e),
    }),

  subscribeNotifications: (userId: string, callback: (list: Notification[]) => void) =>
    Effect.async<() => void, FirestoreError>((resume) => {
      const q = query(
        collection(db(), "notifications"),
        where("userId", "==", userId)
      );
      const unsubscribe = onSnapshot(
        q,
        (snap) => {
          const list = snap.docs
            .map((d) => normalizeNotificationDoc(d.id, d.data() as Record<string, unknown>))
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 100);
          callback(list);
        },
        (err) => resume(Effect.fail(toFirestoreError(err)))
      );
      resume(Effect.succeed(() => unsubscribe()));
    }),

  markNotificationRead: (id: string) =>
    Effect.tryPromise({
      try: () => updateDoc(doc(db(), "notifications", id), { read: true }),
      catch: (e) => toFirestoreError(e),
    }),

  getAllUserIds: () =>
    Effect.tryPromise({
      try: async () => {
        const snap = await getDocs(collection(db(), "users"));
        return snap.docs.map((d) => d.id);
      },
      catch: (e) => toFirestoreError(e),
    }),

  createGlobalNotification: (title: string, body: string) =>
    Effect.tryPromise({
      try: async () => {
        const usersSnap = await getDocs(collection(db(), "users"));
        const userIds = usersSnap.docs.map((d) => d.id);
        const now = Date.now();
        await Promise.all(
          userIds.map((uid) =>
            addDoc(collection(db(), "notifications"), {
              userId: uid,
              type: "global",
              title,
              body,
              read: false,
              createdAt: now,
            })
          )
        );
      },
      catch: (e) => toFirestoreError(e),
    }),
});
