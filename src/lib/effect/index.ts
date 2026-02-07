import { Effect, Layer } from "effect";
import { FirebaseAuthService, FirebaseAuthServiceLive } from "./FirebaseAuth";
import { FirestoreService, FirestoreServiceLive } from "./Firestore";
import { AiAgentService, AiAgentServiceLive } from "./AiAgent";

/** Combined layer for all external services (auth, firestore, AI). */
export const AppLayer = Layer.mergeAll(
  FirebaseAuthServiceLive,
  FirestoreServiceLive,
  AiAgentServiceLive
);

/** Run an effect with AppLayer. Use this to avoid Layer type inference issues with Effect.provide. */
export function runWithAppLayer<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, never> {
  return (Effect.provide as (layer: Layer.Layer<any, any, any>) => (self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, never>)(AppLayer)(effect);
}

export { FirebaseAuthService, FirebaseAuthError } from "./FirebaseAuth";
export { FirestoreService, FirestoreError } from "./Firestore";
export { AiAgentService, AiAgentError } from "./AiAgent";
