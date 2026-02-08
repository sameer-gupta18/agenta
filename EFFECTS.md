# Effectful programming in Swarm Staff

This document describes how the [Effect](https://effect.website/) library (Effect TS) is used to model and run effectful code in this project. Effects are centralized in service interfaces, implemented as layers, and executed at the edges (React event handlers and `useEffect`) via a single runtime.

---

## 1. I/O boundary (effect inventory)

Everything the system can **observe from the outside** or **do to the outside world** is modeled as effects behind three services. The following is the full set of effects the app implements.

### 1.1 Authentication (Firebase Auth + Firestore for role)

| Effect | Description |
|--------|-------------|
| **Sign in** | Email/password sign-in via Firebase Auth; then read role from Firestore `users/{uid}`. |
| **Sign up** | Create user with Firebase Auth, update profile (displayName), optionally set role in Firestore. |
| **Sign out** | Firebase Auth sign-out. |
| **Get current user** | Read Auth current user + role from Firestore. |
| **Subscribe to auth** | Listen to `onAuthStateChanged`; on each event, fetch role from Firestore and push `AppUser \| null` to a callback. |

*Network:* Firebase Auth API. *Persistence:* Firestore `users` for role. *Concurrency:* Subscription returns an unsubscribe (resource release).

### 1.2 Persistence & real-time (Firestore)

| Effect | Description |
|--------|-------------|
| **Users/roles** | `setUserRole`, `getPersonRole` — write/read `users/{uid}` (role, displayName, email). |
| **Managers** | `getManager`, `getManagers`, `setManagerRecord`, `updateManagerRecord` — CRUD on `managers/{uid}`. |
| **Manager invites** | `createManagerInvite`, `getManagerInvite`, `markManagerInviteUsed` — `managerInvites/{token}`. |
| **Employee invites** | `createEmployeeInvite`, `getEmployeeInvite`, `markEmployeeInviteUsed` — `employeeInvites/{token}`. |
| **Employee profiles** | `getEmployeeProfile`, `getEmployeeProfilesByManager`, `createEmployeeProfile`, `updateEmployeeProfile`, `getAllEmployeeProfiles` — `employeeProfiles/{uid}`. |
| **Project assignments** | `createProjectAssignment`, `getAssignment`, `getAssignmentsByEmployee`, `getAssignmentsByManager`, `getAssignmentsAssignedTo`, `updateAssignmentStatus`, `updateAssignmentDelegate`, `updateAssignment`, `deleteAssignment`, `getAllAssignments` — `projectAssignments` collection. |
| **Employee requests** | `createEmployeeRequest`, `getEmployeeRequestsByEmployee`, `getEmployeeRequestsByManager`, `updateEmployeeRequest` — `employeeRequests` collection. |
| **Notifications** | `createNotification`, `subscribeNotifications`, `markNotificationRead`, `createGlobalNotification`, `getAllUserIds` — `notifications` collection; subscription returns unsubscribe (resource release). |

*Persistence:* All Firestore reads/writes. *Time:* `createdAt` / `updatedAt` / `serverTimestamp` at write time. *Concurrency:* `subscribeNotifications` uses `Effect.async` and returns a cleanup function.

### 1.3 Network (AI)

| Effect | Description |
|--------|-------------|
| **Decide assignment** | Given project + candidates, call an external AI (or fallback) to choose one employee; errors caught and fallback returned. |

*Network:* HTTP to an external AI/LLM when configured. *Errors/retries:* Failures are mapped to `AiAgentError`; `Effect.catchAll` yields a deterministic fallback (first candidate).

**Note:** The “Find best match” flow in the UI currently uses `getRankedSuggestionsForTask` from `src/lib/groq.ts` (Groq/LLM), which is **not** in the Effect layer. The Effect layer still defines `AiAgentService.decideAssignment` and provides it in `AppLayer` for consistency and possible reuse or migration.

---

## 2. Effect definitions (code references)

Effects are defined as **service interfaces** (capabilities) and **live implementations** (layers). The runtime wires them once and runs effects at the edges.

### 2.1 Service tags and interfaces

| Symbol | File | Description |
|--------|------|-------------|
| `FirebaseAuthService` | `src/lib/effect/FirebaseAuth.ts` | Context tag + interface: `signIn`, `signUp`, `signOut`, `getCurrentUser`, `subscribeAuth`. |
| `FirebaseAuthError` | `src/lib/effect/FirebaseAuth.ts` | Error type for auth failures. |
| `FirestoreService` | `src/lib/effect/Firestore.ts` | Context tag + interface: full CRUD and subscriptions listed in §1.2. |
| `FirestoreError` | `src/lib/effect/Firestore.ts` | Error type for Firestore failures. |
| `AiAgentService` | `src/lib/effect/AiAgent.ts` | Context tag + interface: `decideAssignment(ctx) => Effect<AssignmentDecision, AiAgentError>`. |
| `AiAgentError` | `src/lib/effect/AiAgent.ts` | Error type for AI failures. |

### 2.2 Live implementations (layers)

| Symbol | File | Description |
|--------|------|-------------|
| `FirebaseAuthServiceLive` | `src/lib/effect/FirebaseAuth.ts` | `Layer.succeed(FirebaseAuthService, { ... })` — wraps Firebase Auth + Firestore role fetch in `Effect.tryPromise` / `Effect.gen`. |
| `FirestoreServiceLive` | `src/lib/effect/Firestore.ts` | `Layer.succeed(FirestoreService, { ... })` — each method is `Effect.tryPromise` (or `Effect.async` for `subscribeNotifications`). |
| `AiAgentServiceLive` | `src/lib/effect/AiAgent.ts` | `Layer.succeed(AiAgentService, { decideAssignment })` — external AI call in `Effect.tryPromise`, wrapped in `Effect.catchAll` for fallback. |

### 2.3 Composition and runtime entry

| Symbol | File | Description |
|--------|------|-------------|
| `AppLayer` | `src/lib/effect/index.ts` | `Layer.mergeAll(FirebaseAuthServiceLive, FirestoreServiceLive, AiAgentServiceLive)` — single layer providing all three services. |
| `runWithAppLayer` | `src/lib/effect/index.ts` | `effect => Effect.provide(AppLayer)(effect)` — eliminates the `R` requirement so the effect can be run with `Effect.runPromise`. |

**Key entry points that run effects:**

- **Auth:** `src/contexts/AuthContext.tsx` — `signIn`, `signOut`, and `subscribeAuth` are implemented as `Effect.gen` over `FirebaseAuthService`, then `runWithAppLayer` + `Effect.runPromise`.
- **Pages:** e.g. `ManagerRequests.tsx`, `EmployeeRequests.tsx`, `ManagerAssign.tsx`, `EmployeeProfile.tsx`, `ManagerLayout.tsx` — use `Effect.gen(function* () { const fs = yield* FirestoreService; ... })`, then `Effect.runPromise(runWithAppLayer(program))` (or `.then`/`.catch` for state updates).

---

## 3. Pure core (business logic)

The “pure” part is the **effect descriptions** themselves: `Effect.gen` pipelines that sequence reads and writes without executing them until run. The app does **not** separate a separate pure domain layer (e.g. no standalone “business rules” module); business rules are expressed inside effectful pipelines that:

1. **Observe** — e.g. load profile, assignments, requests, or notifications via `FirestoreService`.
2. **Compute** — e.g. filter lists, pick a suggestion, build an assignment or request payload (deterministic data shaping).
3. **Perform** — e.g. `createProjectAssignment`, `createNotification`, `updateEmployeeRequest`, `signIn`, etc.

**Main execution paths:**

- **Auth:** Sign-in loads user + role; sign-out clears session; auth subscription keeps `AppUser | null` in sync with Firebase and Firestore.
- **Manager: assign task** — Load employees and (optionally) assignments; build task payload; call external `getRankedSuggestionsForTask` (groq); then create assignment + notification via `FirestoreService` in a single `Effect.gen` pipeline (`handleAssignToCurrent`).
- **Manager: team requests** — Load pending/resolved requests; on accept/reject, `updateEmployeeRequest` and optionally `updateAssignment` (e.g. new deadline).
- **Employee/manager: create request** — `createEmployeeRequest` then `createNotification` for the manager; both in one pipeline.
- **Notifications** — Subscribe via `subscribeNotifications`; on click, optional navigation + `markNotificationRead`; cleanup on unmount.

Failure handling is explicit: `FirestoreError` / `FirebaseAuthError` / `AiAgentError` are typed; `Effect.catchAll` is used where fallback is desired (e.g. AI fallback); at the React edge, `.catch()` maps errors to UI state (e.g. `setError`).

---

## 4. Runtime (what you used)

- **Language:** TypeScript.
- **Effect library:** [Effect](https://effect.website/) (Effect TS), version in `package.json` (e.g. `"effect": "^3.x"`).
- **Runtime style:** No long-lived Effect runtime process. Effects are **run at the edges**:
  - **Synchronous run:** `Effect.runPromise(runWithAppLayer(program))` (or `Effect.runPromise` on an effect that already has the layer provided). Used in React event handlers and `useEffect` for one-off or subscription setup.
  - **Provisioning:** `runWithAppLayer` provides `AppLayer` once per run, so every such call gets the same three services (Auth, Firestore, AI). There is no global “main” that runs a single Effect process; each UI-triggered workflow builds an effect, provides `AppLayer`, and runs it to a Promise.

This keeps all I/O and failure in one place (the Effect layer), makes dependencies explicit (services required in `R` until provided), and keeps reasoning and testing straightforward: swap layers (e.g. test implementations) without changing the pipelines that use `FirestoreService`, `FirebaseAuthService`, and `AiAgentService`.
