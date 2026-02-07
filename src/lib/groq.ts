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
