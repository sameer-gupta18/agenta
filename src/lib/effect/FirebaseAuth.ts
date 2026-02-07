import { Effect, Context, Layer } from "effect";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { getFirebaseAuth, getFirebaseDb } from "../../config/firebase";
import type { AppUser, Role } from "../../types";
import { doc, getDoc } from "firebase/firestore";

export type FirebaseAuthError = { message: string };
export const FirebaseAuthError = Context.GenericTag<FirebaseAuthError>("FirebaseAuthError"); // eslint-disable-line @typescript-eslint/no-redeclare

function getAuth() {
  return getFirebaseAuth();
}

function getDb() {
  return getFirebaseDb();
}

/** Get role from Firestore users/{uid} custom claims or doc */
function fetchUserRole(uid: string): Effect.Effect<Role, FirebaseAuthError> {
  return Effect.tryPromise({
    try: async () => {
      const db = getDb();
      const userDoc = await getDoc(doc(db, "users", uid));
      const data = userDoc.data();
      const role = (data?.role as Role) ?? "employee";
      return role;
    },
    catch: (e) =>
      ({ message: e instanceof Error ? e.message : "Unknown" } as FirebaseAuthError),
  });
}

export interface FirebaseAuthService {
  readonly signIn: (
    email: string,
    password: string
  ) => Effect.Effect<AppUser, FirebaseAuthError>;
  readonly signUp: (
    email: string,
    password: string,
    displayName: string
  ) => Effect.Effect<{ uid: string; email: string; displayName: string }, FirebaseAuthError>;
  readonly signOut: () => Effect.Effect<void, FirebaseAuthError>;
  readonly getCurrentUser: () => Effect.Effect<AppUser | null, FirebaseAuthError>;
  readonly subscribeAuth: (
    cb: (user: AppUser | null) => void
  ) => Effect.Effect<() => void, FirebaseAuthError>;
}

export const FirebaseAuthService = Context.GenericTag<FirebaseAuthService>( // eslint-disable-line @typescript-eslint/no-redeclare
  "FirebaseAuthService"
);

export const FirebaseAuthServiceLive = Layer.succeed(
  FirebaseAuthService,
  {
    signIn: (email: string, password: string) =>
      Effect.gen(function* () {
        const auth = getAuth();
        const cred = yield* Effect.tryPromise({
          try: () => signInWithEmailAndPassword(auth, email, password),
          catch: (e) =>
            ({
              message: e instanceof Error ? e.message : "Sign in failed",
            }),
        });
        const role = yield* fetchUserRole(cred.user.uid);
        return {
          uid: cred.user.uid,
          email: cred.user.email ?? email,
          displayName: cred.user.displayName ?? email.split("@")[0],
          role,
          photoURL: cred.user.photoURL ?? undefined,
        };
      }),

    signUp: (email: string, password: string, displayName: string) =>
      Effect.gen(function* () {
        const auth = getAuth();
        const cred = yield* Effect.tryPromise({
          try: () => createUserWithEmailAndPassword(auth, email, password),
          catch: (e) =>
            ({
              message: e instanceof Error ? e.message : "Sign up failed",
            }),
        });
        yield* Effect.tryPromise({
          try: () => updateProfile(cred.user, { displayName }),
          catch: (e) =>
            ({
              message: e instanceof Error ? e.message : "Update profile failed",
            }),
        });
        return {
          uid: cred.user.uid,
          email: cred.user.email ?? email,
          displayName: displayName || email.split("@")[0],
        };
      }),

    signOut: () =>
      Effect.tryPromise({
        try: () => fbSignOut(getAuth()),
        catch: (e) =>
          ({
            message: e instanceof Error ? e.message : "Sign out failed",
          }),
      }),

    getCurrentUser: () =>
      Effect.gen(function* () {
        const auth = getAuth();
        const fbUser = auth.currentUser;
        if (!fbUser) return null;
        const role = yield* fetchUserRole(fbUser.uid);
        return {
          uid: fbUser.uid,
          email: fbUser.email ?? "",
          displayName: fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "User",
          role,
          photoURL: fbUser.photoURL ?? undefined,
        };
      }),

    subscribeAuth: (cb: (user: AppUser | null) => void) =>
      Effect.tryPromise({
        try: () =>
          new Promise<() => void>((resolve, reject) => {
            const auth = getAuth();
            const unsub = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
              if (!fbUser) {
                cb(null);
                resolve(unsub);
                return;
              }
              try {
                const role = await Effect.runPromise(
                  fetchUserRole(fbUser.uid)
                );
                cb({
                  uid: fbUser.uid,
                  email: fbUser.email ?? "",
                  displayName: fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "User",
                  role,
                  photoURL: fbUser.photoURL ?? undefined,
                });
              } catch (e) {
                cb(null);
              }
              resolve(unsub);
            });
          }),
        catch: (e) =>
          ({
            message: e instanceof Error ? e.message : "Auth subscription failed",
          }),
      }),
  }
);
