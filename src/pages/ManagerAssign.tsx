import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, AiAgentService, runWithAppLayer } from "../lib/effect";
import type { EmployeeProfile, ProjectAssignment, NewProjectRequest, ImportanceLevel } from "../types";
import { getSkillsFromDescription } from "../lib/groq";
import { TagInput } from "../components/TagInput";
import { FiSend } from "react-icons/fi";
import "./ManagerDashboard.css";

export function ManagerAssign() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [newProject, setNewProject] = useState<NewProjectRequest & { deadlineInput?: string }>({
    title: "",
    description: "",
    importance: "medium",
    timeline: "",
    managerId: user?.uid ?? "",
    managerName: user?.displayName ?? "",
    skillsRequired: [],
    deadlineInput: "",
    trainingForLowerLevel: false,
  });

  const load = useCallback(() => {
    if (!user?.uid) return;
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      return yield* fs.getEmployeeProfilesByManager(user.uid);
    });
    Effect.runPromise(runWithAppLayer(program))
      .then((list) => setEmployees(list ?? []))
      .catch(() => setEmployees([]))
      .finally(() => setLoading(false));
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setNewProject((p) => ({
      ...p,
      managerId: user?.uid ?? "",
      managerName: user?.displayName ?? "",
    }));
  }, [user?.uid, user?.displayName]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || employees.length === 0) {
      setError("Add at least one employee on the Dashboard before assigning projects.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    let skillsRequired = [...(newProject.skillsRequired ?? [])];
    if (skillsRequired.length === 0 && newProject.title && newProject.description) {
      skillsRequired = await getSkillsFromDescription(newProject.title, newProject.description);
    }
    const deadlineInput = (newProject.deadlineInput ?? "").trim();
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const ai = yield* AiAgentService;
      const context = {
        project: { ...newProject, managerId: user.uid, managerName: user.displayName },
        candidates: employees.map((e) => ({
          employeeId: e.uid,
          displayName: e.displayName,
          resume: e.resume,
          experience: e.experience,
          workEx: e.workEx,
          skills: e.skills,
        })),
      };
      const decision = yield* ai.decideAssignment(context);
      const chosen = employees.find((c) => c.uid === decision.chosenEmployeeId);
      if (!chosen) throw new Error("Chosen employee not found");
      const deadline = deadlineInput ? Math.floor(new Date(deadlineInput).getTime() / 1000) * 1000 : undefined;
      const assignment: Omit<ProjectAssignment, "createdAt" | "updatedAt"> = {
        id: "",
        title: newProject.title,
        description: newProject.description,
        importance: newProject.importance,
        timeline: (newProject.timeline && newProject.timeline.trim()) || "ASAP",
        ...(deadline != null ? { deadline } : {}),
        ...(skillsRequired.length > 0 ? { skillsRequired } : {}),
        ...(newProject.trainingForLowerLevel ? { trainingForLowerLevel: true } : {}),
        assignedBy: user.uid,
        assignedByName: user.displayName,
        assignedTo: chosen.uid,
        assignedToName: chosen.displayName,
        status: "pending",
      };
      const id = yield* fs.createProjectAssignment(assignment);
      yield* fs.createNotification({
        userId: chosen.uid,
        type: "assignment_sent",
        title: "New assignment",
        body: newProject.title,
        read: false,
        metadata: { assignmentId: id, fromUserId: user.uid, fromUserName: user.displayName },
      });
      return id;
    });
    try {
      await Effect.runPromise(runWithAppLayer(program));
      setNewProject({
        ...newProject,
        title: "",
        description: "",
        timeline: "",
        skillsRequired: [],
        deadlineInput: "",
      });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign project");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="manager-dash manager-dash--page">
      <h1 className="manager-page-title">
        {React.createElement(FiSend as any)} Assign tasks
      </h1>
      <p className="muted" style={{ marginBottom: "1.5rem" }}>
        Create a new project assignment. The AI will suggest the best team member; you assign in one click.
      </p>

      {error && (
        <div className="dash-error" style={{ marginBottom: "1.5rem" }}>
          {error}
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {success && (
        <div className="manager-settings-saved" style={{ marginBottom: "1.5rem" }}>
          Assignment created. You can create another below or go back to the Dashboard.
        </div>
      )}

      {loading ? (
        <p className="muted">Loading your team…</p>
      ) : employees.length === 0 ? (
        <div className="invite-box">
          <p className="muted" style={{ margin: "0 0 1rem 0" }}>
            Add at least one employee on the Dashboard before you can assign projects. Go to Dashboard → Your team → Add employee.
          </p>
          <button type="button" className="btn-primary" onClick={() => navigate("/manager")}>
            Go to Dashboard
          </button>
        </div>
      ) : (
        <form onSubmit={handleCreateProject} className="project-form assign-form">
          <label className="assign-form-label">
            Title
            <input
              value={newProject.title}
              onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
              placeholder="e.g. Build X"
              required
            />
          </label>
          <label className="assign-form-label">
            Description
            <textarea
              value={newProject.description}
              onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
              placeholder="e.g. Debug Y, add feature Z"
              rows={3}
              required
            />
          </label>
          <label className="assign-form-label">
            Importance
            <select
              value={newProject.importance}
              onChange={(e) => setNewProject({ ...newProject, importance: e.target.value as ImportanceLevel })}
              className="assign-form-select"
              aria-label="Importance level"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label className="assign-form-label">
            Deadline (date)
            <input
              type="date"
              value={newProject.deadlineInput ?? ""}
              onChange={(e) => setNewProject({ ...newProject, deadlineInput: e.target.value })}
            />
          </label>
          <div className="assign-form-label">
            <span className="assign-form-label-text">Skills required</span>
            <TagInput
              value={newProject.skillsRequired ?? []}
              onChange={(skillsRequired) => setNewProject({ ...newProject, skillsRequired })}
              placeholder="Type a skill and press Enter"
              className="assign-form-tag-input"
              aria-label="Skills required"
            />
          </div>
          <label className="assign-form-label assign-form-label--checkbox">
            <input
              type="checkbox"
              checked={newProject.trainingForLowerLevel ?? false}
              onChange={(e) => setNewProject({ ...newProject, trainingForLowerLevel: e.target.checked })}
            />
            <span>Can be used as training for lower-level employees</span>
          </label>
          <div className="form-actions">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Assigning…" : "Assign via AI"}
            </button>
            <button type="button" onClick={() => navigate("/manager")} className="btn-secondary">
              Back to Dashboard
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
