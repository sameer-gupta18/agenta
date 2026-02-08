/**
 * Groq API: analyze task title/description to extract skills for ELO updates,
 * and parse CV/resume text into structured profile fields.
 *
 * API key: use REACT_APP_GROQ_API_KEY in .env for the React app (Create React App
 * only exposes REACT_APP_* to the client). Backend/Node can use GROQ_API_KEY.
 * Get your key from https://console.groq.com — same key, correct env var name
 * is required for usage to be attributed.
 */

import Groq from "groq-sdk";
import type { ParsedCV } from "./cvReader";

export function getApiKey(){
  // if (typeof process === "undefined" || !process.env) return null;
  // const env = process.env as Record<string, string | undefined>;
  // const raw = env.REACT_APP_GROQ_API_KEY ?? env.GROQ_API_KEY;
  // const key = raw ? String(raw).trim() : null;
  // return key && key.length > 0 ? key : null;
  return process.env.REACT_APP_GROQ_API_KEY
}

export interface AnalyzeTaskSkillsOptions {
  title: string;
  description: string;
  /** Existing skills of the person who did the task (for coherence). */
  existingSkills?: string[];
}

/**
 * Call Groq to infer 3–8 specific skills from the task. Used when completing a task to update ELO.
 */
export async function analyzeTaskSkills(options: AnalyzeTaskSkillsOptions): Promise<string[]> {
  const key = getApiKey();
  if (!key) return fallbackSkills(options.title, options.description);

  const { title, description, existingSkills = [] } = options;
  const prompt = `You are a skills analyst. Given a completed work task, list 3 to 8 specific skills that this task would demonstrate or develop. Use concise skill names (e.g. "React", "REST APIs", "E2E testing", "PostgreSQL"). Skills can be more specific than the person's current list. If the task relates to existing skills (${existingSkills.join(", ") || "none"}), you may include those or more specific variants. Reply with a JSON array of strings only, no other text. Example: ["React", "TypeScript", "UI components"]`;

  try {
    const groq = new Groq({
      apiKey: key,
      dangerouslyAllowBrowser: true,
    });
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: `Task title: ${title}\nDescription: ${description}\n\n${prompt}` }],
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_tokens: 256,
    });
    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) return fallbackSkills(title, description);
    const parsed = parseJsonArray(text);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  } catch (e) {
    console.warn("Groq API error", e);
  }
  return fallbackSkills(title, description);
}

/**
 * Infer skills from task description when manager posts a task. Used to prefill skillsRequired.
 */
export async function getSkillsFromDescription(title: string, description: string): Promise<string[]> {
  const key = getApiKey();
  if (!key) return fallbackSkills(title, description);

  const prompt = `List 3 to 8 specific skills required or used for this task. Use concise skill names (e.g. "React", "REST APIs", "PostgreSQL"). Reply with a JSON array of strings only. Example: ["React", "TypeScript"]`;

  try {
    const groq = new Groq({
      apiKey: key,
      dangerouslyAllowBrowser: true,
    });
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: `Task: ${title}\n${description}\n\n${prompt}` }],
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_tokens: 256,
    });
    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) return fallbackSkills(title, description);
    const parsed = parseJsonArray(text);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  } catch (e) {
    console.warn("Groq API error", e);
  }
  return fallbackSkills(title, description);
}

function parseJsonArray(text: string): unknown[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const arr = JSON.parse(match[0]);
      return Array.isArray(arr) ? arr : [];
    } catch {
      //
    }
  }
  return [];
}

/**
 * Call Groq to summarize CV text into a 50-60 word professional bio.
 * Exported so the CV reader can call it even when the main parse fails.
 */
export async function summarizeBioForCV(cvText: string): Promise<string | null> {
  const key = getApiKey();
  if (!key) return null;
  const prompt = `Summarize the following CV/resume into a short professional profile summary. Rules: use exactly 50 to 60 words; write in third person; focus on role, experience, and key strengths. Do not include lists, bullet points, or contact details. Output only the summary paragraph, nothing else.`;
  try {
    const groq = new Groq({ apiKey: key, dangerouslyAllowBrowser: true });
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "You output only the requested summary text, no preamble or labels." },
        { role: "user", content: `${prompt}\n\n---\n\n${cvText.slice(0, 6000)}` },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      max_tokens: 150,
    });
    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    const words = text.split(/\s+/).filter(Boolean).slice(0, 60);
    return words.length > 0 ? words.join(" ") : null;
  } catch (e) {
    console.warn("Groq bio summary error", e);
    return null;
  }
}

/**
 * Call Groq to extract exactly 5-6 qualification/skill keywords from CV text.
 * Exported so the CV reader can call it even when the main parse fails.
 */
export async function extractQualificationKeywordsFromCV(cvText: string): Promise<string[]> {
  const key = getApiKey();
  if (!key) return [];
  const prompt = `From the CV below, extract exactly 5 or 6 of the most relevant skill or qualification keywords. Use single words or very short phrases (e.g. React, Python, PMP, Leadership, Project Management). Reply with ONLY a JSON array of strings, no other text. Example: ["React","Python","PMP","Leadership","SQL"]`;
  try {
    const groq = new Groq({ apiKey: key, dangerouslyAllowBrowser: true });
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "You reply with only a JSON array of 5 or 6 strings. No explanation." },
        { role: "user", content: `${prompt}\n\n---\n\n${cvText.slice(0, 6000)}` },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
      max_tokens: 150,
    });
    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) return [];
    const parsed = parseJsonArray(text);
    const arr = Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim())
      : [];
    return arr.slice(0, 6);
  } catch (e) {
    console.warn("Groq qualification keywords error", e);
    return [];
  }
}

/** Extract first complete JSON object from model output (handles markdown and trailing text). */
function extractJsonObject(text: string): unknown {
  let raw = text.trim();
  const codeMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) raw = codeMatch[1].trim();
  const start = raw.indexOf("{");
  if (start === -1) return {};
  let depth = 0;
  let inString: string | null = null;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1));
        } catch {
          return {};
        }
      }
    }
  }
  const fallback = raw.match(/\{[\s\S]*\}/);
  if (fallback) {
    try {
      return JSON.parse(fallback[0]);
    } catch {
      //
    }
  }
  return {};
}

/**
 * Use Groq to parse raw CV/resume text into structured fields.
 * Follows Groq docs: streaming, max_completion_tokens, then accumulate and parse JSON.
 * Only include a key in the result when the CV clearly contains that information; otherwise omit (leave field blank).
 */
export async function parseCVWithGroq(fullText: string): Promise<ParsedCV> {
  const key = getApiKey();
  if (!key) {
    return {};
  }
  const systemPrompt = `You are a CV/resume parser. Extract structured data and return exactly one JSON object with no other text. Do NOT include "bio" or "qualifications" keys — those are generated separately.

Use these keys only:
- position: string — job title or current role.
- education: array of strings — degrees and schools (e.g. "BSc Computer Science, MIT").
- phone: string — any phone number if present.
- department: string — department if mentioned.
- gender: string — if clearly stated (e.g. in personal details).
- dateOfBirth: string — ISO date YYYY-MM-DD if present; omit if only age is given.
- age: number — age in years if stated; omit if only birth date is given.
- skills: array of strings — technical and soft skills listed in the CV.
- experience: string — work history or experience section (can be long).
- workEx: string — same as experience.
- resume: string — optional, leave empty or omit.`;
  const userContent = `Extract from this CV into one JSON object (no bio, no qualifications keys).\n\n---\n\n${fullText.slice(0, 12000)}`;
  try {
    const groq = new Groq({
      apiKey: key,
      dangerouslyAllowBrowser: true,
    });
    const createParams = {
      messages: [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: userContent },
      ],
      model: "llama-3.1-8b-instant" as const,
      temperature: 0.1,
      max_completion_tokens: 2048,
      stream: true as const,
    };
    const stream = await groq.chat.completions.create(createParams);
    let fullContent = "";
    for await (const chunk of stream) {
      const part = chunk.choices?.[0]?.delta?.content;
      if (typeof part === "string") fullContent += part;
    }
    const text = fullContent.trim();
    if (!text) return {};
    const raw = extractJsonObject(text) as Record<string, unknown>;
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
    const str = (v: unknown): string | undefined =>
      typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;

    const num = (v: unknown): number | undefined =>
      typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
    return {
      ...(str(raw.position) !== undefined && { position: str(raw.position) }),
      ...(arr(raw.education).length > 0 && { education: arr(raw.education) }),
      ...(str(raw.phone) !== undefined && { phone: str(raw.phone) }),
      ...(str(raw.department) !== undefined && { department: str(raw.department) }),
      ...(str(raw.gender) !== undefined && { gender: str(raw.gender) }),
      ...(str(raw.dateOfBirth) !== undefined && { dateOfBirth: str(raw.dateOfBirth) }),
      ...(num(raw.age) !== undefined && { age: num(raw.age) }),
      ...(str(raw.experience) !== undefined && { experience: str(raw.experience) }),
      ...((str(raw.workEx) ?? str(raw.experience)) !== undefined && { workEx: str(raw.workEx) ?? str(raw.experience) }),
      ...(arr(raw.skills).length > 0 && { skills: arr(raw.skills) }),
      ...(str(raw.resume) !== undefined && { resume: str(raw.resume) }),
    };
  } catch (e) {
    console.warn("Groq CV parse error", e);
    return {};
  }
}

/**
 * Summarize long experience/work history text (e.g. from CV) into a concise paragraph.
 * Used when raw extraction is very long so the form gets a readable summary.
 */
export async function summarizeLongExperienceForCV(longText: string): Promise<string | null> {
  const key = getApiKey();
  if (!key || !longText || longText.trim().length < 400) return null;
  const prompt = `Summarize the following work experience / career history into one concise paragraph (about 80–120 words). Keep key roles, companies, and dates. Write in third person. Output only the summary, no headings or labels.`;
  try {
    const groq = new Groq({ apiKey: key, dangerouslyAllowBrowser: true });
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "You output only the summary paragraph." },
        { role: "user", content: `${prompt}\n\n---\n\n${longText.slice(0, 6000)}` },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      max_tokens: 300,
    });
    const text = completion.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : null;
  } catch (e) {
    console.warn("Groq experience summary error", e);
    return null;
  }
}

/**
 * Generate or expand a short task description for the employee view using Groq.
 * Use when the stored description is empty or very short.
 */
export async function expandTaskDescriptionForEmployee(
  title: string,
  existingDescription?: string
): Promise<string | null> {
  const key = getApiKey();
  if (!key) return null;
  const hasExisting = existingDescription && existingDescription.trim().length > 20;
  const prompt = hasExisting
    ? `Below is a work task. Write a clear 2–4 sentence description of what the employee should do, based on the title and any notes. Output only the description, no labels.\n\nTitle: ${title}\nNotes: ${existingDescription.trim().slice(0, 500)}`
    : `Below is a work task title. Write a brief 2–4 sentence description of what the employee should do. Be specific and actionable. Output only the description, no labels.\n\nTitle: ${title}`;
  try {
    const groq = new Groq({ apiKey: key, dangerouslyAllowBrowser: true });
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "You output only the requested task description, no preamble or headings." },
        { role: "user", content: prompt },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_tokens: 320,
    });
    const text = completion.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : null;
  } catch (e) {
    console.warn("Groq expandTaskDescription error", e);
    return null;
  }
}

/**
 * Generate AI-based project aid: practical guidance to help the employee with the task.
 * Returns suggested steps, tips, or best practices (short paragraph or bullets).
 */
export async function getProjectAidFromGroq(
  title: string,
  description?: string
): Promise<string | null> {
  const key = getApiKey();
  if (!key) return null;
  const desc = (description || "").trim().slice(0, 800);
  const prompt = desc.length > 0
    ? `You are a helpful work coach. Given this task, write brief practical guidance to help the employee succeed.\n\nTask: ${title}\nDescription: ${desc}\n\nProvide 3–5 short bullets or a short paragraph with: suggested steps, things to watch for, or best practices. Be concise and actionable. Output only the guidance, no headings or labels.`
    : `You are a helpful work coach. Given this task title, write brief practical guidance to help the employee succeed.\n\nTask: ${title}\n\nProvide 3–5 short bullets or a short paragraph with: suggested steps, things to watch for, or best practices. Be concise and actionable. Output only the guidance, no headings or labels.`;
  try {
    const groq = new Groq({ apiKey: key, dangerouslyAllowBrowser: true });
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "You output only the requested guidance text, no preamble or titles." },
        { role: "user", content: prompt },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.35,
      max_tokens: 400,
    });
    const text = completion.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : null;
  } catch (e) {
    console.warn("Groq getProjectAid error", e);
    return null;
  }
}

export function fallbackSkills(title: string, description: string): string[] {
  const t = (title + " " + (description || "")).toLowerCase();
  const skills: string[] = [];
  if (/api|integration|rest/.test(t)) skills.push("REST APIs", "Backend integration");
  if (/dashboard|admin|ui|redesign/.test(t)) skills.push("React", "TypeScript", "UI components");
  if (/e2e|cypress|test/.test(t)) skills.push("Cypress", "E2E testing", "Jest");
  if (/mobile|responsive|layout/.test(t)) skills.push("React", "CSS", "Responsive design");
  if (/database|migration|postgres/.test(t)) skills.push("PostgreSQL", "SQL", "Migrations");
  if (/doc|documentation/.test(t)) skills.push("Technical writing", "API documentation");
  if (/security|audit|auth/.test(t)) skills.push("Security audit", "Authentication");
  if (/performance|optimize|query/.test(t)) skills.push("Performance profiling", "SQL optimization");
  if (skills.length === 0) skills.push("Project delivery", "Collaboration");
  return [...new Set(skills)];
}

/** Candidate sent to the mediator: full profile + comprehensive live metadata */
export interface MediatorCandidate {
  employeeId: string;
  displayName: string;
  skills?: string[];
  skillRatings?: Record<string, number>;
  bio?: string;
  experience?: string;
  workEx?: string;
  pastCompletedTitles?: string[];
  /** Current number of active (non-completed) assignments. MEDIUM priority: balance workload. */
  currentWorkload?: number;
  /** Count of distinct past project titles. LOW priority: tiebreaker only; do NOT use to prefer inexperience over experience. */
  diversityOfTasks?: number;
  /** Number of completed assignments. HIGH: signals experience. */
  totalCompletedCount?: number;
  /** Unix ms of most recent completed assignment. HIGH: recency of experience. */
  lastCompletedAt?: number;
  /** Unix ms when agent model was last updated (profile/ratings). Metadata for consistency. */
  lastAgentTrainedAt?: number;
  /** Average Elo for skills required by this task (1500 = default). HIGH: primary fit signal. */
  taskSkillRatingAvg?: number;
  /** Number of task-required skills the candidate has (any rating). HIGH: skill overlap. */
  taskSkillMatchCount?: number;
  /** Required skills for this task that candidate has (for mediator reasoning). */
  matchedTaskSkills?: string[];
  /** Capacity: 1/(1+currentWorkload). MEDIUM: avoid overload. */
  capacityScore?: number;
  /** Optional: employee's stated goals (MEDIUM: align tasks when fit is comparable). */
  goals?: string;
  /** Optional: work preferences (MEDIUM: align tasks when fit is comparable). */
  preferences?: string;
  /** Optional: favorite/target companies (MEDIUM: relevant if task relates to a company). */
  favoriteCompanies?: string[];
  /** Optional: awards/recognitions (metadata for AI alignment). */
  awards?: string[];
  /** Optional: past or side projects from profile (metadata for AI alignment). */
  projects?: string[];
}

/** Task summary for the mediator */
export interface MediatorTaskInput {
  title: string;
  description: string;
  importance: string;
  timeline: string;
  skillsRequired?: string[];
  trainingForLowerLevel?: boolean;
}

/** One ranked suggestion from the mediator */
export interface RankedSuggestion {
  employeeId: string;
  reason: string;
}

/**
 * Mediator: given task + enriched candidates (skills, bio, past projects), returns
 * an ordered list of employee IDs best suited first, with a short reason each.
 * Uses Groq so all "agent" reasoning is done in one call.
 */
export async function getRankedSuggestionsForTask(
  task: MediatorTaskInput,
  candidates: MediatorCandidate[]
): Promise<RankedSuggestion[]> {
  const key = getApiKey();
  if (!key || candidates.length === 0) {
    return candidates.map((c) => ({ employeeId: c.employeeId, reason: "Fallback: ordered by list" }));
  }

  const candidateBlocks = candidates.map((c) => {
    const skills = (c.skills ?? []).join(", ") || "—";
    const ratings =
      c.skillRatings && Object.keys(c.skillRatings).length > 0
        ? Object.entries(c.skillRatings)
            .slice(0, 14)
            .map(([s, r]) => `${s}:${r}`)
            .join(", ")
        : "—";
    const past = (c.pastCompletedTitles ?? []).slice(0, 12);
    const pastStr = past.length > 0 ? past.join("; ") : "—";
    const workload = c.currentWorkload ?? 0;
    const diversity = c.diversityOfTasks ?? past.length;
    const completed = c.totalCompletedCount ?? past.length;
    const lastDone = c.lastCompletedAt != null ? new Date(c.lastCompletedAt).toISOString().slice(0, 10) : "—";
    const lastTrained = c.lastAgentTrainedAt != null ? new Date(c.lastAgentTrainedAt).toISOString().slice(0, 10) : "—";
    const taskRating = c.taskSkillRatingAvg != null ? Math.round(c.taskSkillRatingAvg) : "—";
    const matchCount = c.taskSkillMatchCount ?? 0;
    const matchedSkills = (c.matchedTaskSkills ?? []).length > 0 ? (c.matchedTaskSkills ?? []).join(", ") : "—";
    const capacity = c.capacityScore != null ? c.capacityScore.toFixed(2) : (1 / (1 + workload)).toFixed(2);
    const goalsStr = (c.goals ?? "").trim().slice(0, 200) || "—";
    const prefsStr = (c.preferences ?? "").trim().slice(0, 200) || "—";
    const companiesStr = (c.favoriteCompanies ?? []).length > 0 ? (c.favoriteCompanies ?? []).join(", ") : "—";
    const awardsStr = (c.awards ?? []).length > 0 ? (c.awards ?? []).join("; ") : "—";
    const profileProjectsStr = (c.projects ?? []).length > 0 ? (c.projects ?? []).join("; ") : "—";
    return `[${c.employeeId}] ${c.displayName}
  skills: ${skills}
  skillRatings: ${ratings}
  taskSkillRatingAvg: ${taskRating} (avg Elo for task skills)
  taskSkillMatchCount: ${matchCount} matchedTaskSkills: ${matchedSkills}
  totalCompletedCount: ${completed} lastCompletedAt: ${lastDone} lastAgentTrainedAt: ${lastTrained}
  currentWorkload: ${workload} capacityScore: ${capacity}
  diversityOfTasks: ${diversity}
  goals: ${goalsStr}
  preferences: ${prefsStr}
  favoriteCompanies: ${companiesStr}
  awards: ${awardsStr}
  profile projects (past/side): ${profileProjectsStr}
  bio: ${(c.bio ?? c.workEx ?? c.experience ?? "").slice(0, 300) || "—"}
  past completed projects: ${pastStr}`;
  });

  const systemPrompt = `You are a mediator AI. Multiple agents MUTUALLY DECIDE who gets the task. Rank ALL candidates using the comprehensive metadata below. Parameters have different importance—apply them in this order.

PARAMETER IMPORTANCE (apply in this order; do not let lower override higher):

1. CRITICAL – Experience and skill fit
   - taskSkillRatingAvg, taskSkillMatchCount, matchedTaskSkills: primary signals for whether the person can do the task.
   - totalCompletedCount, lastCompletedAt, skillRatings, past completed projects: proven experience.
   - Never prefer someone with less experience over someone with more experience solely for "diversity of tasks" or "variety". Diversity is a LOW-priority tiebreaker only.

2. HIGH – Task importance and training flag
   - When task importance is critical/high: strongly prefer candidates with high taskSkillMatchCount and taskSkillRatingAvg.
   - When "Training opportunity for lower-level" is Yes: favor someone who would grow (lower ratings or fewer completed) without ignoring safety—still consider minimum fit.
   - When training is No: favor proven fit (experience and skill match).

3. MEDIUM – Workload and capacity
   - currentWorkload, capacityScore: avoid overloading; when two candidates are close in fit, prefer the one with lower current workload.
   - Do not use workload to prefer an unqualified person over a qualified one.

4. MEDIUM – Goals, preferences, favorite companies, awards, profile projects
   - goals, preferences, favoriteCompanies, awards, profile projects: when two candidates are comparable in fit and workload, prefer the one whose goals, preferences, or profile (e.g. awards, past/side projects, target companies) align with the task. Do not override experience/skill fit with these alone.

5. LOW – Diversity of tasks
   - diversityOfTasks: use only as a tiebreaker when fit and workload are comparable. Do NOT use diversity as an argument to assign someone without experience over someone with experience.

Rules:
- Return a full ranking: every candidate exactly once, ordered by suitability.
- Experience and skill fit dominate. Diversity must not override experience.
- Use all metadata including goals, preferences, favoriteCompanies, awards, and profile projects when present so the decision is transparent and consistent.

Reply with ONLY a JSON array: [{ "employeeId": "...", "reason": "..." }, ...]. Include every candidate exactly once.`;

  const userContent = `Task:
Title: ${task.title}
Description: ${task.description}
Importance: ${task.importance}
Timeline: ${task.timeline}
Skills required: ${(task.skillsRequired ?? []).join(", ") || "—"}
Training opportunity for lower-level: ${task.trainingForLowerLevel ? "Yes" : "No"}

Candidates (one block per person; employeeId in brackets):
${candidateBlocks.join("\n\n")}

Respond with a JSON array only: [{ "employeeId": "...", "reason": "..." }, ...]`;

  try {
    const groq = new Groq({
      apiKey: key,
      dangerouslyAllowBrowser: true,
    });
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      max_tokens: 2048,
    });
    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) return fallbackRanked(candidates);

    const parsed = parseRankedSuggestions(text, candidates);
    if (parsed.length > 0) return parsed;
  } catch (e) {
    console.warn("Groq mediator error", e);
  }
  return fallbackRanked(candidates);
}

function fallbackRanked(candidates: MediatorCandidate[]): RankedSuggestion[] {
  return candidates.map((c) => ({ employeeId: c.employeeId, reason: "Ranking unavailable; listed by profile order." }));
}

function parseRankedSuggestions(text: string, candidates: MediatorCandidate[]): RankedSuggestion[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]) as unknown[];
    if (!Array.isArray(arr)) return [];
    const ids = new Set(candidates.map((c) => c.employeeId));
    const result: RankedSuggestion[] = [];
    for (const item of arr) {
      if (item && typeof item === "object" && "employeeId" in item && "reason" in item) {
        const id = String((item as { employeeId: unknown }).employeeId);
        const reason = String((item as { reason: unknown }).reason);
        if (ids.has(id)) result.push({ employeeId: id, reason });
      }
    }
    if (result.length === 0) return [];
    const appended = new Set(result.map((r) => r.employeeId));
    for (const c of candidates) {
      if (!appended.has(c.employeeId)) result.push({ employeeId: c.employeeId, reason: "Additional candidate." });
    }
    return result;
  } catch {
    return [];
  }
}

/** Agent log entry for splash: system agents or per-candidate (employee) agent */
export interface AgentSplashMessage {
  agent: string;
  message: string;
  type: "thinking" | "speak" | "decision" | "handoff";
  target?: string;
  /** When set, this message is from a candidate/employee agent; show their avatar */
  employeeId?: string;
}

/** Optional context for splash message generation (more informed agent dialogue). */
export interface AgentSplashContext {
  taskImportance?: string;
  trainingForLowerLevel?: boolean;
  skillsRequired?: string[];
}

/**
 * Generate 16–22 agent activity messages for the assign splash using the AI.
 * Agents discuss with parameter importance: experience/skill fit first, workload/capacity, diversity only as tiebreaker.
 */
export async function getAgentSplashMessages(
  taskTitle: string,
  taskDescription: string,
  candidates: { employeeId: string; displayName: string }[],
  context?: AgentSplashContext
): Promise<AgentSplashMessage[]> {
  const key = getApiKey();
  if (!key || candidates.length === 0) return [];

  const namesList = candidates.map((c) => `${c.displayName} (${c.employeeId})`).join(", ");
  const importanceNote = context?.taskImportance ? ` Task importance: ${context.taskImportance}.` : "";
  const trainingNote = context?.trainingForLowerLevel ? " Training opportunity for lower-level: Yes (favor growth where fit allows)." : "";
  const skillsNote = context?.skillsRequired?.length ? ` Skills required: ${context.skillsRequired.join(", ")}.` : "";

  const systemPrompt = `You generate a "chat" log for a task-matching UI. Each message appears as a chat bubble from an avatar. Multiple agents MUTUALLY DECIDE who gets the task. Parameter importance (agents must reflect this in their dialogue):

1. CRITICAL/HIGH: Experience and skill fit (skill ratings, past projects, task skill match). Agents should emphasize "who has the skills and track record". Do NOT let diversity override experience.
2. HIGH: Task importance and training flag (critical tasks need strong fit; training tasks can favor growth).
3. MEDIUM: Workload and capacity (avoid overloading; balance the team).
4. LOW: Diversity of tasks—only as tiebreaker; agents may mention it briefly but must not argue for assigning someone without experience over someone with experience.

Output 16 to 22 messages so the mediator control and communication between agents is substantial. Include at least 7–9 messages from CANDIDATE agents: set "agent" to their display name and "employeeId" to the exact id string. Candidate messages should reference skill fit, experience, capacity, goals, or preferences (e.g. "I have strong match on the required skills", "My workload is low this sprint", "This aligns with my goals", "This fits my preferences", "I'd like to work on this type of project"). System agents: Coordinator, Skills Agent, Profile Agent, Matcher, Mediator. Use types: "thinking", "speak", "decision", "handoff". For handoff include "target". Show handoffs between Skills Agent → Matcher, Profile Agent → Matcher, Matcher → Mediator, Mediator → Coordinator. Keep each message one short sentence. Reply with ONLY a JSON array: [{ "agent": "...", "message": "...", "type": "thinking"|"speak"|"decision"|"handoff", "target"?: "...", "employeeId"?: "..." }, ...].`;

  const userContent = `Task: ${taskTitle}
${taskDescription}${importanceNote}${trainingNote}${skillsNote}

Candidates (displayName and employeeId): ${namesList}

Generate the agent activity log array (16–22 items) with substantial mediator control and agent communication.`;

  try {
    const groq = new Groq({ apiKey: key, dangerouslyAllowBrowser: true });
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.4,
      max_tokens: 2048,
    });
    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) return [];
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const arr = JSON.parse(match[0]) as unknown[];
    if (!Array.isArray(arr) || arr.length === 0) return [];
    const result: AgentSplashMessage[] = [];
    const validTypes = ["thinking", "speak", "decision", "handoff"];
    const validIds = new Set(candidates.map((c) => c.employeeId));
    for (const item of arr) {
      if (!item || typeof item !== "object" || !("agent" in item) || !("message" in item) || !("type" in item)) continue;
      const agent = String((item as { agent: unknown }).agent).trim();
      const message = String((item as { message: unknown }).message).trim();
      const type = (item as { type: unknown }).type;
      if (!agent || !message || !validTypes.includes(type as string)) continue;
      const target = (item as { target?: unknown }).target;
      const employeeId = (item as { employeeId?: unknown }).employeeId;
      const entry: AgentSplashMessage = { agent, message, type: type as AgentSplashMessage["type"] };
      if (typeof target === "string" && target.trim()) entry.target = target.trim();
      if (typeof employeeId === "string" && validIds.has(employeeId)) entry.employeeId = employeeId;
      result.push(entry);
    }
    return result.slice(0, 20);
  } catch (e) {
    console.warn("Groq agent splash messages error", e);
    return [];
  }
}
