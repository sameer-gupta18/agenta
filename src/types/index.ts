/** Shared domain types for Agenta */

export type Role = "admin" | "manager" | "employee";

/** Shared profile fields for managers and employees (agentic model training basis) */
export interface PersonProfileFields {
  gender?: string;
  dateOfBirth?: string; // ISO date YYYY-MM-DD
  age?: number;
  position?: string;
  qualifications?: string[];
  education?: string[];
  phone?: string;
  department?: string;
  /** 0–1 progress for personal agentic model training */
  agenticEvolution?: number;
  /** Last time agent model was updated */
  lastAgentTrainedAt?: number;
  bio?: string;
}

/** Manager invite created by god admin; used once for manager signup */
export interface ManagerInvite {
  token: string;
  createdBy: string; // admin uid
  createdAt: number;
  expiresAt: number;
  used: boolean;
  email?: string;
  /** If set, the new manager will report to this manager uid. Null/omit = independent team. */
  reportsTo?: string | null;
  /** Display name of the manager they report to (for signup UI). */
  reportsToDisplayName?: string;
  /** Position set by admin; shown read-only on signup. */
  position?: string;
  /** Department set by admin; shown read-only on signup. */
  department?: string;
}

/** Employee invite created by manager; used once for employee self-registration */
export interface EmployeeInvite {
  token: string;
  createdBy: string; // manager uid
  createdAt: number;
  expiresAt: number;
  used: boolean;
  /** Optional pre-fill from manager. */
  email?: string;
  position?: string;
  department?: string;
}

/** Manager record in Firestore (managers collection) */
export interface ManagerRecord extends PersonProfileFields {
  uid: string;
  email: string;
  displayName: string;
  /** If set, this manager reports to another manager (nested hierarchy). */
  reportsTo?: string;
  /** Elo rating per skill when manager has tasks assigned to them. */
  skillRatings?: Record<string, number>;
  createdAt: number;
}

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  photoURL?: string;
}

export interface EmployeeProfile extends PersonProfileFields {
  uid: string;
  email: string;
  displayName: string;
  resume?: string;
  experience?: string;
  workEx?: string;
  skills?: string[];
  /** Elo rating per skill (e.g. "React" -> 1520). Updated when assignments complete. */
  skillRatings?: Record<string, number>;
  managerId: string;
  createdAt: number;
  updatedAt: number;
  /** Optional: career/work goals (used by AI mediator and personal agents). */
  goals?: string;
  /** Optional: work preferences e.g. project types, work style (used by AI). */
  preferences?: string;
  /** Optional: favorite or target companies (used by AI for task/project alignment). */
  favoriteCompanies?: string[];
  /** Work experience entries (e.g. company, role, duration). */
  workExperience?: string[];
  /** Awards and recognitions. */
  awards?: string[];
  /** Past or side projects (for AI / profile). */
  projects?: string[];
  /** Dreams / long-term aspirations (for AI training). */
  dreams?: string;
  /** Short-term aspirations (for AI training). */
  aspirations?: string;
}

/** Employee request to manager: question, extension, emergency, etc. */
export type EmployeeRequestType = "question" | "extension" | "emergency" | "other";

export interface EmployeeRequest {
  id: string;
  fromEmployee: string;
  fromEmployeeName: string;
  toManager: string;
  type: EmployeeRequestType;
  /** Assignment id when type is extension/emergency. */
  assignmentId?: string;
  assignmentTitle?: string;
  message: string;
  status: "pending" | "accepted" | "rejected";
  responseMessage?: string;
  /** New deadline (ms) when manager accepts extension. */
  newDeadline?: number;
  createdAt: number;
  updatedAt: number;
  respondedAt?: number;
}

export type ImportanceLevel = "low" | "medium" | "high" | "critical";

/** Importance level mapped to "opponent" Elo for skill updates (higher = harder task). */
export const IMPORTANCE_ELO: Record<ImportanceLevel, number> = {
  low: 1400,
  medium: 1500,
  high: 1600,
  critical: 1700,
};

export interface ProjectAssignment {
  id: string;
  title: string;
  description: string;
  importance: ImportanceLevel;
  timeline: string; // e.g. "2025-02-14" or "ASAP"
  /** Deadline as Unix timestamp (optional). */
  deadline?: number;
  /** Skills required for this task (set when creating). */
  skillsRequired?: string[];
  assignedBy: string; // manager uid who assigned (parent manager when delegated)
  assignedByName: string;
  assignedTo: string; // employee uid or manager uid (when manager has a manager, they can receive tasks)
  assignedToName: string;
  /** Niche skills used/developed (filled on completion; can come from Gemini). */
  skillsUsed?: string[];
  /** Whether this assignment can be used as training for lower-level employees. */
  trainingForLowerLevel?: boolean;
  status: "pending" | "in_progress" | "completed";
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

/** Input when manager creates a new project (before AI assigns) */
export interface NewProjectRequest {
  title: string;
  description: string;
  importance: ImportanceLevel;
  timeline: string;
  /** Deadline as Unix timestamp (optional). */
  deadline?: number;
  managerId: string;
  managerName: string;
  /** Skills required for this task (array of tags). */
  skillsRequired?: string[];
  /** Niche skills used on this project (comma-separated or array); legacy. */
  skillsUsed?: string[];
  /** Whether this assignment can be used as training for lower-level employees. */
  trainingForLowerLevel?: boolean;
}

/** Payload for middlemen AI: project + candidate employees */
export interface AssignmentContext {
  project: NewProjectRequest;
  candidates: Array<{
    employeeId: string;
    displayName: string;
    resume?: string;
    experience?: string;
    workEx?: string;
    skills?: string[];
  }>;
}

/** Result from middlemen AI: chosen employee id */
export interface AssignmentDecision {
  chosenEmployeeId: string;
  reason?: string;
}

/** In-app notification for a user */
export type NotificationType =
  | "work_done"      // employee completed task
  | "help_request"   // employee requested help
  | "assignment_sent" // manager assigned task
  | "global"        // admin broadcast
  | "update";       // generic update

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
  metadata?: {
    assignmentId?: string;
    requestId?: string;
    fromUserId?: string;
    fromUserName?: string;
    [key: string]: unknown;
  };
}
