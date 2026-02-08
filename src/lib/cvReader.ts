/**
 * CV/Resume reader: extract text from PDF or TXT and parse into profile fields.
 * When Groq API key is set: runs main parse + dedicated bio summary and qualification keywords (AI),
 * then merges so bio is always the 50-60 word summary and qualifications the 5-6 keywords.
 */

import {
  getApiKey,
  parseCVWithGroq,
  summarizeBioForCV,
  extractQualificationKeywordsFromCV,
  summarizeLongExperienceForCV,
} from "./groq";

export interface ParsedCV {
  education?: string[];
  qualifications?: string[];
  experience?: string;
  workEx?: string;
  skills?: string[];
  resume?: string;
  bio?: string;
  position?: string;
  phone?: string;
  department?: string;
  gender?: string;
  dateOfBirth?: string; // ISO YYYY-MM-DD
  age?: number;
}

const SECTION_HEADERS = [
  "education",
  "academic",
  "experience",
  "work experience",
  "employment",
  "professional experience",
  "skills",
  "technical skills",
  "qualifications",
  "certifications",
  "summary",
  "profile",
  "about",
  "bio",
  "resume",
  "objective",
  "career summary",
  "contact",
  "contact information",
  "phone",
  "department",
];

/** Match phone numbers: +1 234 567 8900, (123) 456-7890, 123-456-7890, etc. */
function extractPhoneFromText(text: string): string | undefined {
  const phoneMatch = text.match(
    /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4})?/
  );
  return phoneMatch ? phoneMatch[0].trim() : undefined;
}

function normalizeLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function splitSections(fullText: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let currentHeader = "resume";
  let currentContent: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    const isHeader =
      line.length < 60 &&
      SECTION_HEADERS.some((h) => lower === h || lower.startsWith(h + ":") || lower.endsWith(h));
    if (isHeader) {
      const prev = normalizeLine(currentContent.join(" "));
      if (prev) {
        const existing = sections.get(currentHeader);
        sections.set(currentHeader, existing ? existing + "\n\n" + prev : prev);
      }
      currentHeader = SECTION_HEADERS.find((h) => lower.includes(h)) ?? "resume";
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  const prev = normalizeLine(currentContent.join(" "));
  if (prev) {
    const existing = sections.get(currentHeader);
    sections.set(currentHeader, existing ? existing + "\n\n" + prev : prev);
  }

  return sections;
}

function section(sections: Map<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    for (const [header, content] of sections) {
      if (header.includes(k) && content) return content;
    }
  }
  return undefined;
}

function asList(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\n|;|•|–|—|\d+\./)
    .map((s) => normalizeLine(s))
    .filter((s) => s.length > 2);
}

function asSkills(text: string | undefined): string[] {
  if (!text) return [];
  const list = asList(text);
  const flat = list.flatMap((s) => s.split(/[,&]|\band\b/).map((t) => normalizeLine(t)).filter(Boolean));
  return [...new Set(flat)].slice(0, 30);
}

/**
 * Parse plain text from a CV into structured fields.
 */
export function parseCVText(fullText: string): ParsedCV {
  const sections = splitSections(fullText);
  const education = asList(
    section(sections, "education", "academic") ?? section(sections, "qualifications")
  );
  const qualifications = asList(section(sections, "qualifications", "certifications"));
  const experience = section(sections, "experience", "work experience", "employment");
  const workEx = experience; // same block often
  const skills = asSkills(section(sections, "skills"));
  const summary = section(sections, "summary", "profile", "about", "bio", "objective");
  const resume = section(sections, "resume") ?? fullText.slice(0, 2000);
  const contactBlock = section(sections, "contact", "contact information", "phone");
  const phone = contactBlock ? extractPhoneFromText(contactBlock) : extractPhoneFromText(fullText);
  const department = section(sections, "department");

  return {
    education: education.length ? education : undefined,
    qualifications: qualifications.length ? qualifications : undefined,
    experience: experience || undefined,
    workEx: workEx || undefined,
    skills: skills.length ? skills : undefined,
    resume: resume || undefined,
    bio: summary || undefined,
    phone: phone || undefined,
    department: department?.trim() || undefined,
  };
}

/**
 * Extract text from a PDF file (browser).
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  const lib = pdfjsLib as {
    getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<{ numPages: number; getPage: (i: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }> }> };
    GlobalWorkerOptions?: { workerSrc: string };
    version?: string;
  };
  if (typeof window !== "undefined" && lib.GlobalWorkerOptions && lib.version) {
    lib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${lib.version}/build/pdf.worker.min.mjs`;
  }
  const arrayBuffer = await file.arrayBuffer();
  const doc = await lib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str ?? "").join(" ");
    text += pageText + "\n";
  }
  return text;
}

/** Merge two ParsedCV objects; second overwrites first for defined fields. */
function mergeParsedCV(base: ParsedCV, overlay: ParsedCV): ParsedCV {
  return {
    education: overlay.education?.length ? overlay.education : base.education,
    qualifications: overlay.qualifications?.length ? overlay.qualifications : base.qualifications,
    experience: overlay.experience ?? base.experience,
    workEx: overlay.workEx ?? base.workEx ?? overlay.experience ?? base.experience,
    skills: overlay.skills?.length ? overlay.skills : base.skills,
    resume: overlay.resume ?? base.resume,
    bio: overlay.bio ?? base.bio,
    position: overlay.position ?? base.position,
    phone: overlay.phone ?? base.phone,
    department: overlay.department ?? base.department,
  };
}

/**
 * Read file as text (PDF or TXT). Returns parsed CV fields.
 * Always runs rule-based parsing; overlays Groq result when API key is set and Groq returns data.
 */
export async function readCVFile(file: File): Promise<ParsedCV> {
  const name = (file.name || "").toLowerCase();
  let fullText: string;
  if (name.endsWith(".pdf")) {
    fullText = await extractTextFromPDF(file);
  } else if (name.endsWith(".txt") || name.endsWith(".text")) {
    fullText = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ""));
      r.onerror = () => reject(new Error("Failed to read file"));
      r.readAsText(file);
    });
  } else {
    throw new Error("Unsupported file type. Use PDF or TXT.");
  }
  const trimmed = fullText.replace(/\s+/g, " ").trim();
  if (trimmed.length < 20) {
    throw new Error(
      "Could not extract enough text from this file. Try a text-based PDF or a .txt file. Image-only PDFs are not supported."
    );
  }
  const ruleBased = parseCVText(fullText);
  if (!getApiKey()) {
    return ruleBased;
  }
  try {
    const [groqParsed, bioSummary, qualificationKeywords] = await Promise.all([
      parseCVWithGroq(fullText),
      summarizeBioForCV(fullText),
      extractQualificationKeywordsFromCV(fullText),
    ]);
    const merged = mergeParsedCV(ruleBased, groqParsed);
    const longExperience = merged.experience ?? merged.workEx ?? "";
    const experienceSummary =
      longExperience.trim().length > 400
        ? await summarizeLongExperienceForCV(longExperience)
        : null;
    return {
      ...merged,
      bio: bioSummary ?? merged.bio,
      qualifications:
        qualificationKeywords.length > 0 ? qualificationKeywords : merged.qualifications,
      ...(experienceSummary && {
        experience: experienceSummary,
        workEx: experienceSummary,
      }),
    };
  } catch (e) {
    console.warn("CV Groq parse error", e);
    return ruleBased;
  }
}
