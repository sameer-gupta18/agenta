import { Effect, Context, Layer } from "effect";
import type { AssignmentContext, AssignmentDecision } from "../../types";

/** @internal effect tag + type pattern */
export type AiAgentError = { message: string };
export const AiAgentError = Context.GenericTag<AiAgentError>("AiAgentError"); // eslint-disable-line @typescript-eslint/no-redeclare

export interface AiAgentService {
  /** Middlemen: given project + candidates, decide which employee is best suited */
  readonly decideAssignment: (ctx: AssignmentContext) => Effect.Effect<AssignmentDecision, AiAgentError>;
}

export const AiAgentService = Context.GenericTag<AiAgentService>("AiAgentService"); // eslint-disable-line @typescript-eslint/no-redeclare

/** Fallback when OpenAI is not configured: pick first candidate */
function fallbackDecide(ctx: AssignmentContext): AssignmentDecision {
  if (ctx.candidates.length === 0) {
    throw new Error("No candidates");
  }
  return { chosenEmployeeId: ctx.candidates[0].employeeId, reason: "Fallback: first available candidate" };
}

/** Live implementation: try OpenAI first, then fallback */
export const AiAgentServiceLive = Layer.succeed(AiAgentService, {
  decideAssignment: (ctx: AssignmentContext) =>
    Effect.gen(function* () {
      const apiKey = process.env.REACT_APP_OPENAI_API_KEY;
      if (!apiKey || ctx.candidates.length === 0) {
        return fallbackDecide(ctx);
      }
      const result = yield* Effect.tryPromise({
        try: async (): Promise<AssignmentDecision> => {
          const { OpenAI } = await import("openai");
          const openai = new OpenAI({ apiKey });
          const candidateSummary = ctx.candidates
            .map(
              (c) =>
                `- ${c.displayName} (id: ${c.employeeId}): skills=${(c.skills ?? []).join(", ")}, workEx: ${c.workEx ?? "N/A"}`
            )
            .join("\n");
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are a middlemen AI that assigns projects to the best-suited employee. Reply with ONLY a JSON object: { "chosenEmployeeId": "<employee uid>", "reason": "<short reason>" }. Choose from the given candidate IDs only.`,
              },
              {
                role: "user",
                content: `Project: ${ctx.project.title}\nDescription: ${ctx.project.description}\nImportance: ${ctx.project.importance}\nTimeline: ${ctx.project.timeline}\n\nCandidates:\n${candidateSummary}\n\nRespond with JSON only.`,
              },
            ],
            response_format: { type: "json_object" },
          });
          const text = response.choices[0]?.message?.content ?? "{}";
          const parsed = JSON.parse(text) as { chosenEmployeeId?: string; reason?: string };
          const id = parsed.chosenEmployeeId ?? ctx.candidates[0].employeeId;
          if (!ctx.candidates.some((c) => c.employeeId === id)) {
            return { chosenEmployeeId: ctx.candidates[0].employeeId, reason: parsed.reason };
          }
          return { chosenEmployeeId: id, reason: parsed.reason };
        },
        catch: (e) => ({ message: e instanceof Error ? e.message : "AI error" } as AiAgentError),
      });
      return result;
    }).pipe(
      Effect.catchAll(() => Effect.succeed(fallbackDecide(ctx)))
    ),
});
