/**
 * Elo-style rating for skills. Updated when assignments are completed:
 * task importance = "opponent" strength, completion = win (score 1).
 */

import type { ImportanceLevel } from "../types";
import { IMPORTANCE_ELO } from "../types";

const DEFAULT_ELO = 1500;
const K = 24;

/** Expected score (0–1) for a player with rating `playerElo` against opponent with `opponentElo`. */
export function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

/** New Elo after a match. score: 1 = win, 0 = loss, 0.5 = draw. */
export function eloUpdate(currentElo: number, opponentElo: number, score: number, k: number = K): number {
  const expected = expectedScore(currentElo, opponentElo);
  return Math.round(currentElo + k * (score - expected));
}

/** Get default rating for importance (used as "opponent" when task is completed). */
export function importanceToOpponentElo(importance: ImportanceLevel): number {
  return IMPORTANCE_ELO[importance] ?? 1500;
}

/**
 * Compute new skill ratings after completing an assignment.
 * For each skill in skillsUsed, treat completion as a "win" vs task difficulty (importance).
 */
export function updateSkillRatingsForCompletion(
  currentRatings: Record<string, number> | undefined,
  skillsUsed: string[] | undefined,
  importance: ImportanceLevel
): Record<string, number> {
  if (!skillsUsed?.length) return currentRatings ?? {};
  const opponentElo = importanceToOpponentElo(importance);
  const next: Record<string, number> = { ...(currentRatings ?? {}) };
  for (const skill of skillsUsed) {
    const name = skill.trim();
    if (!name) continue;
    const current = next[name] ?? DEFAULT_ELO;
    next[name] = eloUpdate(current, opponentElo, 1);
  }
  return next;
}

export { DEFAULT_ELO as DEFAULT_SKILL_ELO };
