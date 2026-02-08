# Agenta

A TypeScript web app for managers and employees. Managers create project assignments; a middlemen AI (or fallback scoring) picks the best-suited employee. Built with React, Effect, and Firebase (Auth + Firestore).

## How to run the project

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Firebase setup**

   - Create a project in the [Firebase Console](https://console.firebase.google.com).
   - Enable **Authentication** (Email/Password).
   - Create a **Firestore** database.
   - In Project settings → General, add a web app and copy the config.
   - Copy `.env.example` to `.env.local` and set the `REACT_APP_FIREBASE_*` variables.

3. **Run the app**

   ```bash
   npm start
   ```

## How to create a god admin

Only users with role `admin` can access `/admin` and create manager invite links. To create the first admin:

1. In Firebase Console → Project Settings → **Service Accounts**, click **Generate new private key** and save the JSON file (e.g. `./serviceAccountKey.json`). Add this path to `.gitignore`.

2. Set environment variables and run the script:

   **Windows (cmd):**
   ```bash
   set ADMIN_EMAIL=your-admin@company.com
   set ADMIN_PASSWORD=your-secure-password
   set ADMIN_DISPLAY_NAME=Admin
   set GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
   npm run create-god-admin
   ```

   **macOS / Linux:**
   ```bash
   export ADMIN_EMAIL=your-admin@company.com
   export ADMIN_PASSWORD=your-secure-password
   export ADMIN_DISPLAY_NAME=Admin
   export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
   npm run create-god-admin
   ```

   Or pass the key path as the first argument:
   ```bash
   node scripts/create-god-admin.js ./serviceAccountKey.json
   ```

3. The script creates or updates the Firebase Auth user and sets Firestore `users/<uid>` to `role: "admin"`. Sign in at the app with that email and password; you will be redirected to the admin dashboard at `/admin`, where you can create manager invite links for signup.
