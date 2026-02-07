# Swarm Staff

A TypeScript web app for managers and employees, with **Effect** used for all external communication (Firebase Auth, Firestore, and the middlemen AI). Each employee has a personalized AI agent (experience/trustability); a middlemen AI assigns projects to the best-suited employee.

## Features

- **Manager dashboard**: View team (employees you create with email/password), create project assignments with title, description, importance, and timeline. The **middlemen AI** picks the best employee for each project and the task appears on their dashboard.
- **Employee dashboard**: (For reference; employees do not sign in to this app—only god admin and managers can sign in. Managers create employee accounts and assign work; employees are represented by their AI agents.)
- **AI assignment**: When a manager creates a project, the app sends the project and all team members’ profiles (experience, trustability, skills) to a middlemen AI (OpenAI if `REACT_APP_OPENAI_API_KEY` is set; otherwise a fallback score). The chosen employee gets the task on their dashboard.
- **Agent growth**: When a manager marks a task as completed, the assigned employee’s agent experience and trustability increase so future assignments can favor them for similar work.
- **Admin dashboard (god admin)**: Only users with role `admin` can access `/admin`. They can create manager invite links (stored in Firestore `managerInvites`). Manager signup is restricted to valid invite links; random users cannot create manager accounts.

## Tech stack

- **React 19** + **TypeScript**
- **Effect** for all I/O: auth, Firestore, and AI (see `src/lib/effect/`)
- **Firebase** (Auth + Firestore) for all user data, roles, manager invites, managers, employee profiles, and project assignments
- **OpenAI** (optional) for the middlemen AI

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Firebase**

   - Create a project in the [Firebase Console](https://console.firebase.google.com).
   - Enable **Authentication** (Email/Password).
   - Create a **Firestore** database.
   - In Project settings → General, add a web app and copy the config.
   - Copy `.env.example` to `.env.local` and fill in the `REACT_APP_FIREBASE_*` variables.

3. **Firestore structure** (all app data is stored/updated in Firestore)

   - `users/{uid}` – `role` ("admin" | "manager" | "employee"), `displayName`, `email`, `updatedAt`.
   - `managers/{uid}` – `uid`, `email`, `displayName`, `createdAt` (one doc per manager, for admin listing).
   - `managerInvites/{token}` – `token`, `createdBy` (admin uid), `createdAt`, `expiresAt`, `used`. Created by admin; used once for manager signup.
   - `employeeProfiles/{uid}` – `uid`, `email`, `displayName`, `managerId`, `agentExperience`, `agentTrustability`, `resume`, `experience`, `workEx`, `skills`, `createdAt`, `updatedAt`.
   - `projectAssignments` (collection, auto IDs) – `title`, `description`, `importance`, `timeline`, `assignedBy`, `assignedByName`, `assignedTo`, `assignedToName`, `status` ("pending" | "in_progress" | "completed"), `createdAt`, `updatedAt`, `completedAt` (optional).

4. **Create the god admin (required)**

   Only a god admin can create manager accounts. Create the first admin with the script:

   - In Firebase Console → Project Settings → Service Accounts, click **Generate new private key** and save the JSON file somewhere safe (e.g. `./serviceAccountKey.json` — add this path to `.gitignore`).
   - Set environment variables and run:
     ```bash
     set ADMIN_EMAIL=your-admin@company.com
     set ADMIN_PASSWORD=your-secure-password
     set ADMIN_DISPLAY_NAME=God Admin
     set GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
     npm run create-god-admin
     ```
     (On macOS/Linux use `export` instead of `set`.) Or pass the key path as the first argument: `node scripts/create-god-admin.js ./serviceAccountKey.json`
   - The script creates or updates the Firebase Auth user and sets Firestore `users/<uid>` to `role: "admin"`. Sign in at the app with that email and password; you will be redirected to the admin dashboard.

5. **Deploy Cloud Functions (required for managers to add employees)**

   Managers create employee accounts from the dashboard; the app calls a Cloud Function that creates the Firebase user and Firestore records. Deploy it once:

   ```bash
   cd functions && npm install && cd ..
   npx firebase deploy --only functions
   ```
   (Requires [Firebase CLI](https://firebase.google.com/docs/cli) and `firebase login`.)

6. **Optional: OpenAI**

   - Set `REACT_APP_OPENAI_API_KEY` in `.env.local` for AI-driven assignment. If unset, assignment uses a simple experience + trustability score.

7. **Run**

   ```bash
   npm start
   ```

## First use

- **God admin**: Run `npm run create-god-admin` (see Setup) to create the admin user, then sign in at `/login`. You’re redirected to `/admin`, where you can create **manager invite links**. Only these links allow new manager signups.
- **Managers**: Get an invite link from an admin (`/signup?role=manager&managerInvite=<token>`). Sign up with that link, then sign in. Use “Add employee” to create employee accounts (you set their email and password). Employees cannot sign up themselves.
- **Sign-in**: Only god admin and managers can sign in. Employees do not sign in to the app; managers create their accounts and assign work.
- **Assigning work**: Manager fills “New project assignment”, submits; the middlemen AI selects an employee and the task appears on that employee’s dashboard. Manager can “Mark completed” to bump that employee’s agent metrics. All of this data is stored and updated in Firestore.

## Project layout

- `src/lib/effect/` – Effect services: `FirebaseAuth`, `Firestore`, `AiAgent`; composed in `index.ts` as `AppLayer`.
- `src/contexts/AuthContext.tsx` – Auth state and sign-in/sign-out (runs Effect with `AppLayer`).
- `src/pages/` – Login, SignUp, ManagerDashboard, EmployeeDashboard.
- `src/types/index.ts` – Shared types (User, EmployeeProfile, ProjectAssignment, etc.).

All external communication (Firebase and AI) goes through Effect; the UI runs effects via `Effect.provide(program, AppLayer)` and `Effect.runPromise`.
