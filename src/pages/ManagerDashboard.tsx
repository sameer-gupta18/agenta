import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { EmployeeProfile, ManagerRecord, ProjectAssignment } from "../types";
import { updateSkillRatingsForCompletion } from "../lib/skillElo";
import { analyzeTaskSkills, fallbackSkills as groqFallbackSkills } from "../lib/groq";
import { FiUsers, FiBriefcase, FiCheck, FiSend, FiUserPlus, FiUser, FiClock } from "react-icons/fi";
import "./ManagerDashboard.css";
import "./EmployeeDashboard.css";

function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&radius=50`;
}

export function ManagerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [managers, setManagers] = useState<ManagerRecord[]>([]);
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [assignmentsAssignedToMe, setAssignmentsAssignedToMe] = useState<ProjectAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [myManager, setMyManager] = useState<ManagerRecord | null>(null);
  const [completionPopup, setCompletionPopup] = useState<{
    taskTitle: string;
    assignedToName: string;
    skillsUpdated: string[];
    lastAgentTrainedAt: boolean;
  } | null>(null);

  const load = useCallback(() => {
    if (!user?.uid) return;
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const emps = yield* fs.getEmployeeProfilesByManager(user.uid);
      const mgrs = yield* fs.getManagers();
      const assigns = yield* fs.getAssignmentsByManager(user.uid);
      const assignedToMe = yield* fs.getAssignmentsAssignedTo(user.uid);
      const myRecord = (mgrs ?? []).find((m) => m.uid === user.uid);
      const myManager = myRecord?.reportsTo ? (mgrs ?? []).find((m) => m.uid === myRecord.reportsTo) ?? null : null;
      return { emps, mgrs, assigns, assignedToMe, myManager: myManager ?? undefined };
    });
    const run = runWithAppLayer(program);
    Effect.runPromise(run)
      .then(({ emps, mgrs, assigns, assignedToMe, myManager }) => {
        setEmployees(emps);
        setManagers(mgrs ?? []);
        setAssignments(assigns);
        setAssignmentsAssignedToMe(assignedToMe);
        setMyManager(myManager ?? null);
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

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

      const now = Date.now();
      const program = Effect.gen(function* () {
        const f = yield* FirestoreService;
        if (empProfile) {
          const skillRatings = updateSkillRatingsForCompletion(
            empProfile.skillRatings,
            skillsToUse,
            assignment.importance
          );
          if (Object.keys(skillRatings).length > 0) {
            yield* f.updateEmployeeProfile(assignment.assignedTo, { skillRatings, lastAgentTrainedAt: now });
          }
        } else if (managerProfile) {
          const currentRatings = managerProfile.skillRatings ?? {};
          const skillRatings = updateSkillRatingsForCompletion(currentRatings, skillsToUse, assignment.importance);
          if (Object.keys(skillRatings).length > 0) {
            yield* f.updateManagerRecord(assignment.assignedTo, { skillRatings, lastAgentTrainedAt: now });
          }
        }
        if (assignment.assignedBy && assignment.assignedBy !== assignment.assignedTo) {
          yield* f.updateManagerRecord(assignment.assignedBy, {}).pipe(Effect.catchAll(() => Effect.void));
        }
      });
      await Effect.runPromise(runWithAppLayer(program));

      const metadataSummary =
        skillsToUse.length > 0
          ? `Skill ratings updated for: ${skillsToUse.join(", ")}. lastAgentTrainedAt updated for ${assignment.assignedToName}.`
          : `lastAgentTrainedAt updated for ${assignment.assignedToName}.`;
      const notifyBody = `${assignment.assignedToName} completed: ${assignment.title}. ${metadataSummary} Task removed from list.`;

      const notifyProgram = Effect.gen(function* () {
        const f = yield* FirestoreService;
        yield* f.createNotification({
          userId: assignment.assignedBy,
          type: "work_done",
          title: "Work completed",
          body: notifyBody,
          read: false,
          metadata: { assignmentId, fromUserId: assignment.assignedTo, fromUserName: assignment.assignedToName },
        });
      });
      await Effect.runPromise(runWithAppLayer(notifyProgram)).catch(() => {});

      const deleteProgram = Effect.gen(function* () {
        const f = yield* FirestoreService;
        yield* f.deleteAssignment(assignmentId);
      });
      await Effect.runPromise(runWithAppLayer(deleteProgram));

      setCompletionPopup({
        taskTitle: assignment.title,
        assignedToName: assignment.assignedToName,
        skillsUpdated: skillsToUse,
        lastAgentTrainedAt: true,
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setCompletingId(null);
    }
  };


  const getStatusColor = (status: ProjectAssignment["status"]) => {
    switch (status) {
      case "completed": return "status-done";
      case "in_progress": return "status-progress";
      default: return "status-pending";
    }
  };

  /* Completed assignments excluded from dashboard; visible only on Completed tasks page */
  const currentAssignments = assignments.filter((a) => a.status !== "completed");
  const currentAssignedToMe = assignmentsAssignedToMe.filter((a) => a.status !== "completed");
  const employeeIdsWithCurrentTask = new Set(
    [...currentAssignments, ...currentAssignedToMe].map((a) => a.assignedTo)
  );

  if (!user) return null;

  return (
    <div className="manager-dash manager-dash--page">
      <h1 className="manager-page-title">Manager dashboard</h1>

      {completionPopup && (
        <div className="modal-overlay" onClick={() => setCompletionPopup(null)} role="presentation">
          <div className="modal-content completion-popup" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="completion-popup-title">
            <div className="completion-popup-header">
              <span className="completion-popup-icon" aria-hidden>{React.createElement(FiCheck as any)}</span>
              <h3 id="completion-popup-title">Task completed</h3>
            </div>
            <div className="completion-popup-task-row">
              <span className="completion-popup-task-title">{completionPopup.taskTitle}</span>
              <span className="completion-popup-assignee">
                {React.createElement(FiUser as any)} {completionPopup.assignedToName}
              </span>
            </div>
            <div className="completion-popup-updates">
              <span className="completion-popup-updates-label">Profile updates</span>
              <div className="completion-popup-chips">
                {completionPopup.skillsUpdated.map((skill) => (
                  <span key={skill} className="completion-popup-chip completion-popup-chip--skill">{skill}</span>
                ))}
                {completionPopup.lastAgentTrainedAt && (
                  <span className="completion-popup-chip completion-popup-chip--meta">
                    {React.createElement(FiClock as any)} lastAgentTrainedAt
                  </span>
                )}
                <span className="completion-popup-chip completion-popup-chip--meta">Removed from list</span>
              </div>
            </div>
            <button type="button" className="btn-primary completion-popup-ok" onClick={() => setCompletionPopup(null)}>
              OK
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="dash-error">
          {error}
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {myManager && (
        <section className="employee-dash-section">
          <h2 className="employee-dash-section__heading">
            {React.createElement(FiUser as any)} Your manager
          </h2>
          <Link to="/manager/my-manager" className="employee-manager-card">
            <img src={getAvatarUrl(myManager.uid)} alt="" className="employee-manager-card__avatar" />
            <div className="employee-manager-card__body">
              <div className="employee-manager-card__name">{myManager.displayName}</div>
              {myManager.position && <div className="employee-manager-card__meta">{myManager.position}</div>}
              {myManager.department && <div className="employee-manager-card__meta">{myManager.department}</div>}
              <span className="employee-manager-card__email">{myManager.email}</span>
            </div>
          </Link>
        </section>
      )}

      <section className="section">
        <h2>{React.createElement(FiUsers as any)} Your team</h2>
        <p className="muted" style={{ marginBottom: "1rem" }}>Assign tasks and view progress.</p>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <ul className="employee-list">
            {employees.map((emp) => (
              <li
                key={emp.uid}
                className={`employee-card${employeeIdsWithCurrentTask.has(emp.uid) ? " employee-card--has-task" : ""}`}
              >
                <img src={getAvatarUrl(emp.uid)} alt="" className="employee-card__avatar" />
                <div className="employee-card__body">
                  <div className="emp-name">{emp.displayName}</div>
                  <div className="emp-meta">{emp.email}</div>
                </div>
              </li>
            ))}
            {employees.length === 0 && (
              <li className="muted">No employees yet.</li>
            )}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>{React.createElement(FiBriefcase as any)} Assign project</h2>
        <p className="muted">Create and assign tasks on the Assign tasks page.</p>
        <button type="button" onClick={() => navigate("/manager/assign")} className="btn-primary">
          {React.createElement(FiSend as any)} New project assignment
        </button>
      </section>

      {currentAssignedToMe.length > 0 && (
        <section className="section section--assigned-to-me">
          <h2>{React.createElement(FiUserPlus as any)} Tasks assigned to you</h2>
          <p className="muted">Delegate or mark completed.</p>
          <ul className="assignment-list">
            {currentAssignedToMe.map((a) => (
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
                      onClick={() => navigate("/manager/assign", { state: { delegateAssignment: a } })}
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

      <section className="section section--created-by-me">
        <h2>{React.createElement(FiBriefcase as any)} Assignments you created</h2>
        <p className="muted">Current tasks you assigned. Completed tasks are in Completed tasks.</p>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <ul className="assignment-list">
            {currentAssignments.map((a) => (
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
            {currentAssignments.length === 0 && <li className="muted">No current assignments. Completed tasks are in Completed tasks.</li>}
          </ul>
        )}
      </section>
    </div>
  );
}
