/**
 * Gemini API: analyze task title/description to extract skills for Elo updates.
 * Returns skills that may be niche (different from bio) or map to existing skills.
 */

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

function getApiKey(): string | null {
  return typeof process !== "undefined" && process.env?.REACT_APP_GEMINI_API_KEY
    ? process.env.REACT_APP_GEMINI_API_KEY.trim()
    : null;
}

export interface AnalyzeTaskSkillsOptions {
  title: string;
  description: string;
  /** Existing skills of the person who did the task (for coherence). */
  existingSkills?: string[];
}

/**
 * Call Gemini to infer 3–8 specific skills from the task. Skills can be new or
 * aligned with existing ones; used with Elo to update or add ratings.
 */
export async function analyzeTaskSkills(options: AnalyzeTaskSkillsOptions): Promise<string[]> {
  const key = getApiKey();
  if (!key) return fallbackSkills(options.title, options.description);

  const { title, description, existingSkills = [] } = options;
  const prompt = `You are a skills analyst. Given a completed work task, list 3 to 8 specific skills that this task would demonstrate or develop. Use concise skill names (e.g. "React", "REST APIs", "E2E testing", "PostgreSQL"). Skills can be more specific than the person's current list (e.g. "React Hooks", "TypeScript") and can include new skills not in their profile. If the task clearly relates to their existing skills (${existingSkills.join(", ") || "none"}), you may include those or more specific variants. Reply with a JSON array of strings only, no other text. Example: ["React", "TypeScript", "UI components"]`;

  const body = {
    contents: [{ role: "user", parts: [{ text: `Task title: ${title}\nDescription: ${description}\n\n${prompt}` }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
  };

  try {
    const res = await fetch(`${GEMINI_URL}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      console.warn("Gemini API error", res.status, t);
      return fallbackSkills(title, description);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return fallbackSkills(title, description);
    const parsed = parseJsonArray(text);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.filter((s) => typeof s === "string" && s.trim());
  } catch (e) {
    console.warn("Gemini fetch failed", e);
  }
  return fallbackSkills(title, description);
}

function parseJsonArray(text: string): unknown[] {
  const cleaned = text.replace(/^[\s\S]*?\[/, "[").replace(/\][\s\S]*$/, "]");
  try {
    const arr = JSON.parse(cleaned);
    return Array.isArray(arr) ? arr : [];
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        return Array.isArray(arr) ? arr : [];
      } catch {
        //
      }
    }
  }
  return [];
}

function fallbackSkills(title: string, description: string): string[] {
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
