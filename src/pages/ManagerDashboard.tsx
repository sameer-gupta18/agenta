import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, AiAgentService, runWithAppLayer } from "../lib/effect";
import type { EmployeeProfile, ManagerRecord, ProjectAssignment, ImportanceLevel } from "../types";
import { updateSkillRatingsForCompletion } from "../lib/skillElo";
import { analyzeTaskSkills, fallbackSkills as groqFallbackSkills } from "../lib/groq";
import { FiUsers, FiPlus, FiBriefcase, FiCheck, FiSend, FiUploadCloud, FiUserPlus } from "react-icons/fi";
import { readCVFile } from "../lib/cvReader";
import {
  EducationPicker,
  educationEntriesToStrings,
  stringsToEducationEntries,
  type EducationEntry,
} from "../components/EducationPicker";
import { TagInput } from "../components/TagInput";
import "./ManagerDashboard.css";

const emptyProfile = {
  position: "",
  department: "",
  phone: "",
  bio: "",
  educationEntries: [] as EducationEntry[],
  qualifications: [] as string[],
  experience: "",
  workEx: "",
  skillsText: "",
  resume: "",
};

export function ManagerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [managers, setManagers] = useState<ManagerRecord[]>([]);
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [assignmentsAssignedToMe, setAssignmentsAssignedToMe] = useState<ProjectAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    email: "",
    password: "",
    displayName: "",
    ...emptyProfile,
  });
  const [cvLoading, setCvLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delegateAssignmentId, setDelegateAssignmentId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user?.uid) return;
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const emps = yield* fs.getEmployeeProfilesByManager(user.uid);
      const mgrs = yield* fs.getManagers();
      const assigns = yield* fs.getAssignmentsByManager(user.uid);
      const assignedToMe = yield* fs.getAssignmentsAssignedTo(user.uid);
      return { emps, mgrs, assigns, assignedToMe };
    });
    const run = runWithAppLayer(program);
    Effect.runPromise(run)
      .then(({ emps, mgrs, assigns, assignedToMe }) => {
        setEmployees(emps);
        setManagers(mgrs);
        setAssignments(assigns);
        setAssignmentsAssignedToMe(assignedToMe);
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvLoading(true);
    setError(null);
    try {
      const parsed = await readCVFile(file);
      setNewEmployee((prev) => ({
        ...prev,
        position: parsed.position ?? prev.position,
        department: parsed.department ?? prev.department,
        phone: parsed.phone ?? prev.phone,
        educationEntries: (parsed.education?.length ? stringsToEducationEntries(parsed.education) : prev.educationEntries),
        qualifications: (parsed.qualifications?.length ? parsed.qualifications : prev.qualifications),
        experience: parsed.experience ?? prev.experience,
        workEx: parsed.workEx ?? prev.workEx,
        skillsText: (parsed.skills ?? []).join(", "),
        resume: parsed.resume ?? prev.resume,
        bio: parsed.bio ?? prev.bio,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read CV");
    } finally {
      setCvLoading(false);
      e.target.value = "";
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    setError(null);
    setSubmitting(true);
    try {
      const { getFunctions, httpsCallable } = await import("firebase/functions");
      const { getFirebaseApp } = await import("../config/firebase");
      const fn = getFunctions(getFirebaseApp());
      const createEmployee = httpsCallable<{ email: string; password: string; displayName: string }, { uid: string }>(fn, "createEmployee");
      const { data } = await createEmployee({
        email: newEmployee.email.trim(),
        password: newEmployee.password,
        displayName: newEmployee.displayName.trim() || newEmployee.email.split("@")[0],
      });
      const uid = (data as { uid: string }).uid;
      const educationStrings = educationEntriesToStrings(newEmployee.educationEntries);
      const qualifications = newEmployee.qualifications;
      const skills = newEmployee.skillsText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      const profileUpdate = {
        position: newEmployee.position.trim() || undefined,
        department: newEmployee.department.trim() || undefined,
        phone: newEmployee.phone.trim() || undefined,
        bio: newEmployee.bio.trim() || undefined,
        education: educationStrings.length ? educationStrings : undefined,
        qualifications: qualifications.length ? qualifications : undefined,
        experience: newEmployee.experience.trim() || undefined,
        workEx: newEmployee.workEx.trim() || undefined,
        skills: skills.length ? skills : undefined,
        resume: newEmployee.resume.trim() || undefined,
      };
      const program = Effect.gen(function* () {
        const fs = yield* FirestoreService;
        yield* fs.updateEmployeeProfile(uid, profileUpdate);
      });
      await Effect.runPromise(runWithAppLayer(program));
      setNewEmployee({ email: "", password: "", displayName: "", ...emptyProfile });
      setShowAddEmployee(false);
      load();
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Failed to create employee";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkCompleted = async (assignmentId: string) => {
    if (!user?.uid) return;
    setCompletingId(assignmentId);
    setError(null);
    try {
      const assignment = await Effect.runPromise(
        runWithAppLayer(
          Effect.gen(function* () {
            const f = yield* FirestoreService;
            return yield* f.getAssignment(assignmentId);
          })
        )
      );
      if (!assignment) {
        setError("Assignment not found");
        return;
      }
      const existingSkills: string[] = [];
      const empProfile = await Effect.runPromise(
        runWithAppLayer(
          Effect.gen(function* () {
            const f = yield* FirestoreService;
            return yield* f.getEmployeeProfile(assignment.assignedTo);
          })
        )
      );
      const managerProfile = !empProfile
        ? await Effect.runPromise(
            runWithAppLayer(
              Effect.gen(function* () {
                const f = yield* FirestoreService;
                return yield* f.getManager(assignment.assignedTo);
              })
            )
          )
        : null;
      if (empProfile?.skills) existingSkills.push(...empProfile.skills);

      const groqSkills = await analyzeTaskSkills({
        title: assignment.title,
        description: assignment.description,
        existingSkills,
      });
      const skillsToUse =
        groqSkills.length > 0
          ? groqSkills
          : assignment.skillsUsed?.length
            ? assignment.skillsUsed
            : assignment.skillsRequired?.length
              ? assignment.skillsRequired
              : groqFallbackSkills(assignment.title, assignment.description);

      const program = Effect.gen(function* () {
        const f = yield* FirestoreService;
        yield* f.updateAssignmentStatus(assignmentId, "completed", Date.now());
        yield* f.updateAssignmentSkillsUsed(assignmentId, skillsToUse);
        if (empProfile) {
          const skillRatings = updateSkillRatingsForCompletion(
            empProfile.skillRatings,
            skillsToUse,
            assignment.importance
          );
          if (Object.keys(skillRatings).length > 0) {
            yield* f.updateEmployeeProfile(assignment.assignedTo, { skillRatings });
          }
        } else if (managerProfile) {
          const currentRatings = managerProfile.skillRatings ?? {};
          const skillRatings = updateSkillRatingsForCompletion(currentRatings, skillsToUse, assignment.importance);
          if (Object.keys(skillRatings).length > 0) {
            yield* f.updateManagerRecord(assignment.assignedTo, { skillRatings });
          }
        }
      });
      await Effect.runPromise(runWithAppLayer(program));
      const notifyProgram = Effect.gen(function* () {
        const f = yield* FirestoreService;
        yield* f.createNotification({
          userId: assignment.assignedBy,
          type: "work_done",
          title: "Work completed",
          body: `${assignment.assignedToName} completed: ${assignment.title}`,
          read: false,
          metadata: { assignmentId, fromUserId: assignment.assignedTo, fromUserName: assignment.assignedToName },
        });
      });
      await Effect.runPromise(runWithAppLayer(notifyProgram)).catch(() => {});
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setCompletingId(null);
    }
  };


  const reportsForDelegate = [
    ...employees.map((e) => ({ uid: e.uid, displayName: e.displayName, isManager: false })),
    ...managers.filter((m) => m.reportsTo === user?.uid).map((m) => ({ uid: m.uid, displayName: m.displayName, isManager: true })),
  ];

  const handleDelegate = async (assignmentId: string, assignedTo: string, assignedToName: string) => {
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      yield* fs.updateAssignmentDelegate(assignmentId, assignedTo, assignedToName);
    });
    try {
      await Effect.runPromise(runWithAppLayer(program));
      setDelegateAssignmentId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delegate failed");
    }
  };

  const getStatusColor = (status: ProjectAssignment["status"]) => {
    switch (status) {
      case "completed": return "status-done";
      case "in_progress": return "status-progress";
      default: return "status-pending";
    }
  };

  if (!user) return null;

  return (
    <div className="manager-dash manager-dash--page">
      <h1 className="manager-page-title">Manager dashboard</h1>

      {error && (
        <div className="dash-error">
          {error}
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <section className="section">
        <h2>{React.createElement(FiUsers as any)} Your team</h2>
        <p className="muted" style={{ marginBottom: "1rem" }}>Create employee accounts with email and password. Employees sign in with the credentials you set.</p>
        {!showAddEmployee ? (
          <button type="button" onClick={() => setShowAddEmployee(true)} className="btn-primary">
            {React.createElement(FiPlus as any)} Add employee
          </button>
        ) : (
          <form onSubmit={handleCreateEmployee} className="project-form employee-form">
            <div className="form-section">
              <h3 className="form-section-title">Account</h3>
              <label>
                Display name
                <input
                  value={newEmployee.displayName}
                  onChange={(e) => setNewEmployee({ ...newEmployee, displayName: e.target.value })}
                  placeholder="Employee name"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                  placeholder="employee@company.com"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={newEmployee.password}
                  onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
                  placeholder="Min 6 characters"
                  required
                  minLength={6}
                />
              </label>
            </div>
            <div className="form-section">
              <h3 className="form-section-title">CV (optional)</h3>
              <label className="file-label">
                <input
                  type="file"
                  accept=".pdf,.txt"
                  onChange={handleCVUpload}
                  disabled={cvLoading}
                  className="file-input"
                />
                <span className="file-button">
                  {React.createElement(FiUploadCloud as any)} {cvLoading ? "Reading…" : "Upload PDF or TXT to auto-fill below"}
                </span>
              </label>
            </div>
            <div className="form-section">
              <h3 className="form-section-title">Basic info</h3>
              <label>
                Position
                <input
                  value={newEmployee.position}
                  onChange={(e) => setNewEmployee({ ...newEmployee, position: e.target.value })}
                  placeholder="e.g. Software Engineer"
                />
              </label>
              <label>
                Department
                <input
                  value={newEmployee.department}
                  onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })}
                  placeholder="e.g. Engineering"
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  value={newEmployee.phone}
                  onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })}
                  placeholder="+1 234 567 8900"
                />
              </label>
              <label>
                Bio
                <textarea
                  value={newEmployee.bio}
                  onChange={(e) => setNewEmployee({ ...newEmployee, bio: e.target.value })}
                  placeholder="Short bio"
                  rows={2}
                />
              </label>
            </div>
            <div className="form-section">
              <h3 className="form-section-title">Education</h3>
              <label>
                <EducationPicker
                  value={newEmployee.educationEntries}
                  onChange={(educationEntries) => setNewEmployee({ ...newEmployee, educationEntries })}
                  aria-label="Education"
                />
              </label>
            </div>
            <div className="form-section">
              <h3 className="form-section-title">Qualifications / certifications</h3>
              <label>
                <TagInput
                  value={newEmployee.qualifications}
                  onChange={(qualifications) => setNewEmployee({ ...newEmployee, qualifications })}
                  placeholder="Type a qualification and press Enter"
                  aria-label="Qualifications"
                />
              </label>
            </div>
            <div className="form-section">
              <h3 className="form-section-title">Experience</h3>
              <label>
                Experience summary
                <textarea
                  value={newEmployee.experience}
                  onChange={(e) => setNewEmployee({ ...newEmployee, experience: e.target.value })}
                  placeholder="Brief experience description"
                  rows={2}
                />
              </label>
              <label>
                Work experience (detailed)
                <textarea
                  value={newEmployee.workEx}
                  onChange={(e) => setNewEmployee({ ...newEmployee, workEx: e.target.value })}
                  placeholder="Roles, companies, dates"
                  rows={4}
                />
              </label>
            </div>
            <div className="form-section">
              <h3 className="form-section-title">Skills (comma or newline separated)</h3>
              <label>
                <textarea
                  value={newEmployee.skillsText}
                  onChange={(e) => setNewEmployee({ ...newEmployee, skillsText: e.target.value })}
                  placeholder="e.g. JavaScript, React, Python"
                  rows={2}
                />
              </label>
            </div>
            <div className="form-section">
              <h3 className="form-section-title">Resume / full text</h3>
              <label>
                <textarea
                  value={newEmployee.resume}
                  onChange={(e) => setNewEmployee({ ...newEmployee, resume: e.target.value })}
                  placeholder="Paste or from CV upload"
                  rows={4}
                />
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? "Creating…" : "Create employee"}
              </button>
              <button type="button" onClick={() => setShowAddEmployee(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        )}
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <ul className="employee-list">
            {employees.map((emp) => (
              <li key={emp.uid} className="employee-card">
                <div className="emp-name">{emp.displayName}</div>
                <div className="emp-meta">{emp.email}</div>
              </li>
            ))}
            {employees.length === 0 && (
              <li className="muted">No employees yet. Add an employee above (you set their email and password).</li>
            )}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>{React.createElement(FiBriefcase as any)} Assign project</h2>
        <p className="muted">Create a new task and assign it to a team member via AI. All fields are on the Assign tasks page.</p>
        <button type="button" onClick={() => navigate("/manager/assign")} className="btn-primary">
          {React.createElement(FiSend as any)} New project assignment
        </button>
      </section>

      {assignmentsAssignedToMe.length > 0 && (
        <section className="section section--assigned-to-me">
          <h2>{React.createElement(FiUserPlus as any)} Tasks assigned to you</h2>
          <p className="muted">These tasks were given to you by your manager. You can delegate to your reports or mark them completed.</p>
          <ul className="assignment-list">
            {assignmentsAssignedToMe.map((a) => (
              <li key={a.id} className={`assignment-card ${getStatusColor(a.status)}`}>
                <div className="assign-title">{a.title}</div>
                <div className="assign-meta">
                  From {a.assignedByName} → {a.assignedToName} · {a.importance} · {a.timeline}
                  {a.deadline != null && (
                    <span> · Deadline: {new Date(a.deadline).toLocaleDateString()}</span>
                  )}
                </div>
                {a.status !== "completed" && (
                  <div className="assign-actions">
                    <button
                      type="button"
                      onClick={() => setDelegateAssignmentId(a.id)}
                      className="btn-small btn-secondary"
                    >
                      Delegate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMarkCompleted(a.id)}
                      className="btn-small"
                      disabled={completingId === a.id}
                    >
                      {React.createElement(FiCheck as any)} {completingId === a.id ? "Updating…" : "Mark completed"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {delegateAssignmentId && (
        <div className="modal-overlay" onClick={() => setDelegateAssignmentId(null)} role="presentation">
          <div className="modal-content" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>Delegate task</h3>
            <p className="muted">Assign this task to one of your reports. The original assigner (your manager) will remain as assigner.</p>
            <ul className="delegate-list">
              {reportsForDelegate.map((r) => (
                <li key={r.uid}>
                  <button
                    type="button"
                    className="btn-small"
                    onClick={() => handleDelegate(delegateAssignmentId, r.uid, r.displayName)}
                  >
                    {r.displayName} {r.isManager ? "(manager)" : ""}
                  </button>
                </li>
              ))}
            </ul>
            {reportsForDelegate.length === 0 && <p className="muted">No direct reports. Add employees or sub-managers first.</p>}
            <button type="button" className="btn-secondary" onClick={() => setDelegateAssignmentId(null)}>Cancel</button>
          </div>
        </div>
      )}

      <section className="section section--created-by-me">
        <h2>{React.createElement(FiBriefcase as any)} Assignments you created</h2>
        <p className="muted">Tasks you created and assigned to your team. You can mark them completed when done.</p>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <ul className="assignment-list">
            {assignments.map((a) => (
              <li key={a.id} className={`assignment-card ${getStatusColor(a.status)}`}>
                <div className="assign-title">{a.title}</div>
                <div className="assign-meta">
                  → {a.assignedToName} · {a.importance} · {a.timeline}
                  {a.deadline != null && (
                    <span> · Deadline: {new Date(a.deadline).toLocaleDateString()}</span>
                  )}
                </div>
                {a.status !== "completed" && (
                  <button
                    type="button"
                    onClick={() => handleMarkCompleted(a.id)}
                    className="btn-small"
                    disabled={completingId === a.id}
                  >
                    {React.createElement(FiCheck as any)} {completingId === a.id ? "Updating…" : "Mark completed"}
                  </button>
                )}
              </li>
            ))}
            {assignments.length === 0 && <li className="muted">No assignments yet.</li>}
          </ul>
        )}
      </section>
    </div>
  );
}
