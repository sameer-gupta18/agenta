import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { EmployeeProfile, ProjectAssignment, NewProjectRequest, ImportanceLevel } from "../types";
import { getSkillsFromDescription, getRankedSuggestionsForTask, getAgentSplashMessages, type RankedSuggestion, type AgentSplashMessage, type MediatorCandidate } from "../lib/groq";
import { DEFAULT_SKILL_ELO } from "../lib/skillElo";
import { TagInput } from "../components/TagInput";
import { FiSend, FiUser, FiCheck, FiChevronRight } from "react-icons/fi";
import "./ManagerDashboard.css";

type AssignPhase = "form" | "loading" | "suggesting" | "no_more";

type AgentLogEntry = AgentSplashMessage & { id: number };

/** Fallback when AI splash messages are unavailable. */
function getSplashFallback(employees: { uid: string; displayName: string }[]): AgentSplashMessage[] {
  const base: Omit<AgentSplashMessage, "employeeId">[] = [
    { agent: "Coordinator", message: "Finding the best fit for this task.", type: "speak" },
    { agent: "Skills Agent", message: "Extracting required skills.", type: "thinking" },
    { agent: "Profile Agent", message: "Loading team data.", type: "thinking" },
    { agent: "Skills Agent", message: "Skills ready. Handing off.", type: "handoff", target: "Matcher" },
    { agent: "Profile Agent", message: "Profiles ready. Handing off.", type: "handoff", target: "Matcher" },
    { agent: "Matcher Agent", message: "Comparing fit and workload.", type: "thinking" },
    { agent: "Mediator", message: "Ranking by fit and workload.", type: "decision" },
    { agent: "Coordinator", message: "Collecting inputs.", type: "speak" },
    { agent: "Mediator", message: "Ranking complete.", type: "handoff", target: "Coordinator" },
    { agent: "Coordinator", message: "Top suggestion ready.", type: "decision" },
  ];
  const withIds: AgentSplashMessage[] = base.map((entry, i) => {
    const e = employees[i % employees.length];
    if (e && i >= 2 && i <= 6) return { ...entry, employeeId: e.uid };
    return entry as AgentSplashMessage;
  });
  return withIds;
}

function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&radius=50`;
}

type DelegateAssignmentState = ProjectAssignment | undefined;

export function ManagerAssign() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const delegateAssignment = (location.state as { delegateAssignment?: DelegateAssignmentState })?.delegateAssignment;
  const delegateAutoLaunchDone = useRef(false);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [phase, setPhase] = useState<AssignPhase>("form");
  const [suggestions, setSuggestions] = useState<RankedSuggestion[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [assignmentCreating, setAssignmentCreating] = useState(false);
  const [agentLog, setAgentLog] = useState<AgentLogEntry[]>([]);
  const [splashMessageList, setSplashMessageList] = useState<AgentSplashMessage[]>([]);
  const [employeeAssignments, setEmployeeAssignments] = useState<ProjectAssignment[]>([]);
  const agentLogIdRef = React.useRef(0);
  const agentLogEndRef = React.useRef<HTMLDivElement | null>(null);
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

  // Agent log: when in loading phase, append messages from splashMessageList (~450ms each); don't interrupt animation
  useEffect(() => {
    if (phase !== "loading") {
      setAgentLog([]);
      return;
    }
    setAgentLog([]);
    const list = splashMessageList.length > 0 ? splashMessageList : getSplashFallback(employees);
    let seqIndex = 0;
    const interval = setInterval(() => {
      if (seqIndex < list.length) {
        const entry = list[seqIndex];
        agentLogIdRef.current += 1;
        setAgentLog((prev) => [...prev, { ...entry, id: agentLogIdRef.current }]);
        seqIndex += 1;
      }
    }, 450);
    return () => clearInterval(interval);
  }, [phase, splashMessageList]);

  useEffect(() => {
    setNewProject((p) => ({
      ...p,
      managerId: user?.uid ?? "",
      managerName: user?.displayName ?? "",
    }));
  }, [user?.uid, user?.displayName]);

  type TaskOverride = Partial<NewProjectRequest & { deadlineInput?: string }>;

  useEffect(() => {
    if (!delegateAssignment || loading || employees.length === 0 || delegateAutoLaunchDone.current) return;
    const a = delegateAssignment;
    const deadlineInput = a.deadline != null
      ? new Date(a.deadline).toISOString().slice(0, 10)
      : "";
    setNewProject((p) => ({
      ...p,
      title: a.title,
      description: a.description,
      importance: a.importance,
      timeline: a.timeline?.trim() || "ASAP",
      skillsRequired: a.skillsRequired ?? [],
      trainingForLowerLevel: a.trainingForLowerLevel ?? false,
      deadlineInput,
    }));
    delegateAutoLaunchDone.current = true;
    const taskOverride: TaskOverride = {
      title: a.title,
      description: a.description,
      importance: a.importance,
      timeline: a.timeline?.trim() || "ASAP",
      skillsRequired: a.skillsRequired ?? [],
      trainingForLowerLevel: a.trainingForLowerLevel ?? false,
      deadlineInput: deadlineInput || undefined,
    };
    handleLaunchTask(undefined, taskOverride);
  }, [delegateAssignment, loading, employees.length]);

  const handleLaunchTask = async (e?: React.FormEvent, taskOverride?: TaskOverride) => {
    e?.preventDefault();
    if (!user || employees.length === 0) {
      setError("Add at least one employee first.");
      return;
    }
    const taskData = taskOverride ?? newProject;
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    const aiMessages = await Promise.race([
      getAgentSplashMessages(
        taskData.title ?? "",
        taskData.description || "",
        employees.map((emp) => ({ employeeId: emp.uid, displayName: emp.displayName })),
        {
          taskImportance: taskData.importance ?? "medium",
          trainingForLowerLevel: taskData.trainingForLowerLevel ?? false,
          skillsRequired: taskData.skillsRequired ?? [],
        }
      ),
      new Promise<AgentSplashMessage[]>((r) => setTimeout(() => r([]), 2200)),
    ]).catch(() => []);
    setSplashMessageList(aiMessages.length > 0 ? aiMessages : getSplashFallback(employees));
    setPhase("loading");
    const splashStart = Date.now();
    let skillsRequired = [...(taskData.skillsRequired ?? [])];
    if (skillsRequired.length === 0 && taskData.title && taskData.description) {
      try {
        skillsRequired = await getSkillsFromDescription(taskData.title, taskData.description);
      } catch {
        // keep existing
      }
    }
    try {
      const assignments = await Effect.runPromise(
        runWithAppLayer(
          Effect.gen(function* () {
            const fs = yield* FirestoreService;
            return yield* fs.getAssignmentsByManager(user.uid);
          })
        )
      );
      const completedByEmployee = new Map<string, { titles: string[]; lastCompletedAt: number }>();
      const activeCountByEmployee = new Map<string, number>();
      for (const a of assignments ?? []) {
        if (a.status === "completed") {
          const cur = completedByEmployee.get(a.assignedTo) ?? { titles: [], lastCompletedAt: 0 };
          cur.titles.push(a.title);
          const completedAt = a.completedAt ?? a.updatedAt ?? 0;
          if (completedAt > cur.lastCompletedAt) cur.lastCompletedAt = completedAt;
          completedByEmployee.set(a.assignedTo, cur);
        } else {
          activeCountByEmployee.set(a.assignedTo, (activeCountByEmployee.get(a.assignedTo) ?? 0) + 1);
        }
      }
      const taskSkills = skillsRequired ?? [];
      const candidates: MediatorCandidate[] = employees.map((e) => {
        const { titles: pastTitles, lastCompletedAt } = completedByEmployee.get(e.uid) ?? { titles: [], lastCompletedAt: 0 };
        const workload = activeCountByEmployee.get(e.uid) ?? 0;
        const ratings = e.skillRatings ?? {};
        const skillsSet = new Set((e.skills ?? []).map((s) => s.trim().toLowerCase()));
        const matchedTaskSkills = taskSkills.filter(
          (s) => skillsSet.has(s.trim().toLowerCase()) || Object.keys(ratings).some((r) => r.trim().toLowerCase() === s.trim().toLowerCase())
        );
        const taskRatingSum = matchedTaskSkills.length > 0
          ? matchedTaskSkills.reduce(
              (sum, sk) => sum + (Object.entries(ratings).find(([r]) => r.trim().toLowerCase() === sk.trim().toLowerCase())?.[1] ?? DEFAULT_SKILL_ELO),
              0
            )
          : 0;
        const taskSkillRatingAvg = matchedTaskSkills.length > 0 ? taskRatingSum / matchedTaskSkills.length : undefined;
        return {
          employeeId: e.uid,
          displayName: e.displayName,
          skills: e.skills,
          skillRatings: e.skillRatings,
          bio: e.bio,
          experience: e.experience,
          workEx: e.workEx,
          pastCompletedTitles: pastTitles,
          currentWorkload: workload,
          diversityOfTasks: new Set(pastTitles).size,
          totalCompletedCount: pastTitles.length,
          lastCompletedAt: lastCompletedAt || undefined,
          lastAgentTrainedAt: e.lastAgentTrainedAt,
          taskSkillRatingAvg,
          taskSkillMatchCount: matchedTaskSkills.length,
          matchedTaskSkills: matchedTaskSkills.length > 0 ? matchedTaskSkills : undefined,
          capacityScore: 1 / (1 + workload),
          goals: e.goals,
          preferences: e.preferences,
          favoriteCompanies: (e.favoriteCompanies ?? []).length > 0 ? e.favoriteCompanies : undefined,
          awards: (e.awards ?? []).length > 0 ? e.awards : undefined,
          projects: (e.projects ?? []).length > 0 ? e.projects : undefined,
        };
      });
      const task = {
        title: taskData.title ?? "",
        description: taskData.description ?? "",
        importance: taskData.importance ?? "medium",
        timeline: (taskData.timeline && taskData.timeline.trim()) || "ASAP",
        skillsRequired,
        trainingForLowerLevel: taskData.trainingForLowerLevel ?? false,
      };
      const ranked = await getRankedSuggestionsForTask(task, candidates);
      const elapsed = Date.now() - splashStart;
      const minSplashMs = 5000;
      if (elapsed < minSplashMs) {
        await new Promise((r) => setTimeout(r, minSplashMs - elapsed));
      }
      await new Promise((r) => setTimeout(r, 1000));
      setSuggestions(ranked);
      setSuggestionIndex(0);
      setPhase(ranked.length > 0 ? "suggesting" : "no_more");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run matching");
      setPhase("form");
    } finally {
      setSubmitting(false);
    }
  };

  const currentSuggestion = phase === "suggesting" ? suggestions[suggestionIndex] : null;
  const currentEmployee = currentSuggestion
    ? employees.find((e) => e.uid === currentSuggestion.employeeId)
    : null;

  useEffect(() => {
    if (phase !== "suggesting" || !currentEmployee?.uid) {
      setEmployeeAssignments([]);
      return;
    }
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      return yield* fs.getAssignmentsByEmployee(currentEmployee.uid);
    });
    Effect.runPromise(runWithAppLayer(program))
      .then((list) => setEmployeeAssignments(list ?? []))
      .catch(() => setEmployeeAssignments([]));
  }, [phase, currentEmployee?.uid]);

  const handleAssignToCurrent = async () => {
    if (!user || !currentEmployee || !currentSuggestion) return;
    setAssignmentCreating(true);
    setError(null);
    const isDelegate = Boolean(delegateAssignment);

    if (isDelegate && delegateAssignment) {
      const program = Effect.gen(function* () {
        const fs = yield* FirestoreService;
        yield* fs.updateAssignmentDelegate(delegateAssignment.id, currentEmployee.uid, currentEmployee.displayName);
        yield* fs.createNotification({
          userId: currentEmployee.uid,
          type: "assignment_sent",
          title: "Task delegated to you",
          body: delegateAssignment.title,
          read: false,
          metadata: { assignmentId: delegateAssignment.id, fromUserId: user.uid, fromUserName: user.displayName ?? "Manager" },
        });
      });
      try {
        await Effect.runPromise(runWithAppLayer(program));
        try {
          const confetti = await import("canvas-confetti");
          confetti.default({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
          setTimeout(() => { confetti.default({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0.2 } }); }, 150);
          setTimeout(() => { confetti.default({ particleCount: 80, angle: 120, spread: 55, origin: { x: 0.8 } }); }, 300);
        } catch {
          // confetti optional
        }
        setSuccess(true);
        setPhase("form");
        setSuggestions([]);
        setSuggestionIndex(0);
        navigate("/manager/assign", { replace: true, state: {} });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delegate failed");
      } finally {
        setAssignmentCreating(false);
      }
      return;
    }

    const deadlineInput = (newProject.deadlineInput ?? "").trim();
    const deadline = deadlineInput ? Math.floor(new Date(deadlineInput).getTime() / 1000) * 1000 : undefined;
    const skillsRequired = newProject.skillsRequired ?? [];
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
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
        assignedTo: currentEmployee.uid,
        assignedToName: currentEmployee.displayName,
        status: "pending",
      };
      const id = yield* fs.createProjectAssignment(assignment);
      yield* fs.createNotification({
        userId: currentEmployee.uid,
        type: "assignment_sent",
        title: "New assignment",
        body: newProject.title,
        read: false,
        metadata: { assignmentId: id, fromUserId: user.uid, fromUserName: user.displayName },
      });
      yield* fs.updateEmployeeProfile(currentEmployee.uid, {});
      yield* fs.updateManagerRecord(user.uid, {}).pipe(Effect.catchAll(() => Effect.void));
      return id;
    });
    try {
      await Effect.runPromise(runWithAppLayer(program));
      try {
        const confetti = await import("canvas-confetti");
        confetti.default({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
        setTimeout(() => { confetti.default({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0.2 } }); }, 150);
        setTimeout(() => { confetti.default({ particleCount: 80, angle: 120, spread: 55, origin: { x: 0.8 } }); }, 300);
      } catch {
        // confetti optional
      }
      setNewProject((p) => ({
        ...p,
        title: "",
        description: "",
        timeline: "",
        skillsRequired: [],
        deadlineInput: "",
      }));
      setSuccess(true);
      setPhase("form");
      setSuggestions([]);
      setSuggestionIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create assignment");
    } finally {
      setAssignmentCreating(false);
    }
  };

  const handleNextSuggestion = () => {
    if (suggestionIndex + 1 >= suggestions.length) {
      setPhase("no_more");
      return;
    }
    setSuggestionIndex((i) => i + 1);
  };

  const handleBackToForm = () => {
    setPhase("form");
    setSuggestions([]);
    setSuggestionIndex(0);
  };

  if (!user) return null;

  return (
    <div className="manager-dash manager-dash--page">
      {phase === "loading" && (
        <div className="assign-splash assign-splash--wireframe" role="alert" aria-live="polite">
          <div className="assign-splash-wireframe">
            <div className="assign-splash-wireframe-left">
              <span className="assign-splash-wireframe-label assign-splash-wireframe-label--agents">Agent outputs</span>
              <div className="assign-splash-wireframe-rows">
                {employees.slice(0, 6).map((emp, rowIndex) => {
                  const numRows = Math.min(employees.length, 6) || 1;
                  const messageForRow = agentLog.filter((_, idx) => idx % numRows === rowIndex).slice(-1)[0];
                  const bubbleText = messageForRow
                    ? (messageForRow.type === "handoff" && messageForRow.target
                      ? `${messageForRow.agent} → ${messageForRow.target}: ${messageForRow.message}`
                      : messageForRow.type === "decision"
                        ? `Decision: ${messageForRow.message}`
                        : messageForRow.message)
                    : "";
                  return (
                    <div key={emp.uid} className="assign-splash-wireframe-row">
                      <div className="assign-splash-wireframe-avatar-wrap">
                        <img src={getAvatarUrl(emp.uid)} alt="" className="assign-splash-wireframe-avatar" title={emp.displayName} />
                        <span className="assign-splash-wireframe-avatar-name">{emp.displayName}</span>
                      </div>
                      <div className="assign-splash-wireframe-connector assign-splash-wireframe-connector--h" />
                      <div className={`assign-splash-wireframe-bubble ${messageForRow ? "assign-splash-wireframe-bubble--filled" : ""} assign-splash-wireframe-bubble--${messageForRow?.type ?? "speak"}`}>
                        {bubbleText ? <span className="assign-splash-wireframe-bubble-text">{bubbleText}</span> : <span className="assign-splash-wireframe-bubble-placeholder">…</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="assign-splash-wireframe-flow-column" aria-hidden>
              <span className="assign-splash-wireframe-label assign-splash-wireframe-label--comm">Communication</span>
              <div className="assign-splash-wireframe-vertical-line" />
            </div>
            <div className="assign-splash-wireframe-right">
              <div className="assign-splash-wireframe-loading-wrap">
                <div className="assign-splash-wireframe-loading">
                  <span className="assign-splash-wireframe-loading-text">Loading</span>
                  <span className="assign-splash-wireframe-loading-dots">
                    <span>.</span><span>.</span><span>.</span>
                  </span>
                </div>
                <div className="assign-splash-wireframe-consolidated">
                  {agentLog.length > 0 && (
                    <p className="assign-splash-wireframe-consolidated-text">
                      {agentLog[agentLog.length - 1].message}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <h1 className="manager-page-title">
        {React.createElement(FiSend as any)} Assign tasks
      </h1>
      <p className="muted" style={{ marginBottom: "1.5rem" }}>
        Create a project and assign to a team member.
      </p>

      {error && (
        <div className="dash-error" style={{ marginBottom: "1.5rem" }}>
          {error}
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {success && (
        <div className="manager-settings-saved" style={{ marginBottom: "1.5rem" }}>
          Assignment created. Create another or go to Dashboard.
        </div>
      )}

      {phase === "suggesting" && currentEmployee && currentSuggestion && (() => {
        const deadlineMs = newProject.deadlineInput?.trim() ? new Date(newProject.deadlineInput).getTime() : null;
        const deadlineStart = deadlineMs ? deadlineMs - 2 * 24 * 60 * 60 * 1000 : null;
        const deadlineEnd = deadlineMs ? deadlineMs + 2 * 24 * 60 * 60 * 1000 : null;
        const activeProjects = employeeAssignments.filter((a) => a.status !== "completed");
        const calendarAroundDeadline = deadlineMs
          ? employeeAssignments.filter((a) => a.deadline != null && a.deadline >= (deadlineStart ?? 0) && a.deadline <= (deadlineEnd ?? 0))
          : [];
        return (
          <div className="assign-suggestion-fullpage">
            <button type="button" className="assign-suggestion-back" onClick={handleBackToForm}>
              ← Back to form
            </button>
            <div className={`assign-suggestion-card assign-suggestion-card--full ${newProject.trainingForLowerLevel ? "assign-suggestion-card--training" : ""}`}>
              <h3 className="assign-suggestion-heading">
                Suggested match
                {newProject.trainingForLowerLevel && (
                  <span className="assign-suggestion-training-badge">Training opportunity</span>
                )}
              </h3>

              <div className="assign-suggestion-grid">
                <div className="assign-suggestion-main">
                  <div className="assign-suggestion-body">
                    <div className="assign-suggestion-avatar">
                      <img src={getAvatarUrl(currentEmployee.uid)} alt="" className="assign-suggestion-avatar-img" />
                    </div>
                    <div className="assign-suggestion-info">
                      <strong className="assign-suggestion-name">{currentEmployee.displayName}</strong>
                      {currentEmployee.position && (
                        <span className="assign-suggestion-meta">{currentEmployee.position}</span>
                      )}
                      {currentEmployee.bio && (
                        <p className="assign-suggestion-bio">{currentEmployee.bio}</p>
                      )}
                      {(currentEmployee.skills?.length ?? 0) > 0 && (
                        <div className="assign-suggestion-skills">
                          {(currentEmployee.skills ?? []).slice(0, 10).map((s) => (
                            <span key={s} className="assign-suggestion-skill-tag">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <section className="assign-suggestion-outlook">
                    <h4 className="assign-suggestion-outlook-title">Why this match</h4>
                    <p className="assign-suggestion-reason">{currentSuggestion.reason}</p>
                    <div className="assign-suggestion-factors">
                      <span className="assign-suggestion-factor">Task importance: {newProject.importance}</span>
                      {newProject.trainingForLowerLevel && (
                        <span className="assign-suggestion-factor assign-suggestion-factor--training">Training opportunity for growth</span>
                      )}
                      <span className="assign-suggestion-factor">Skills: {(newProject.skillsRequired ?? []).length ? newProject.skillsRequired!.join(", ") : "From task"}</span>
                    </div>
                  </section>

                  <div className="assign-suggestion-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleAssignToCurrent}
                      disabled={assignmentCreating}
                    >
                      {assignmentCreating ? "Creating…" : <>{React.createElement(FiCheck as any)} Assign to this person</>}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleNextSuggestion}
                      disabled={assignmentCreating}
                    >
                      Next suggestion {React.createElement(FiChevronRight as any)}
                    </button>
                  </div>
                  <p className="assign-suggestion-hint">
                    Suggestion {suggestionIndex + 1} of {suggestions.length}
                  </p>
                </div>

                <div className="assign-suggestion-side">
                  {splashMessageList.length > 0 && (
                    <section className="assign-suggestion-agents">
                      <h4 className="assign-suggestion-outlook-title">Agent communications</h4>
                      <ul className="assign-suggestion-agents-list">
                        {splashMessageList.slice(0, 8).map((msg, i) => (
                          <li key={i} className="assign-suggestion-agents-item">
                            <span className="assign-suggestion-agents-agent">{msg.agent}</span>
                            <span className="assign-suggestion-agents-msg">{msg.message}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <section className="assign-suggestion-context">
                    <h4 className="assign-suggestion-outlook-title">Current projects</h4>
                    {activeProjects.length === 0 ? (
                      <p className="assign-suggestion-context-empty">No active assignments</p>
                    ) : (
                      <ul className="assign-suggestion-projects-list">
                        {activeProjects.slice(0, 5).map((a) => (
                          <li key={a.id} className="assign-suggestion-projects-item">
                            <span className="assign-suggestion-projects-title">{a.title}</span>
                            <span className="assign-suggestion-projects-meta">{a.status} · {a.importance}</span>
                          </li>
                        ))}
                        {activeProjects.length > 5 && <li className="assign-suggestion-projects-more">+{activeProjects.length - 5} more</li>}
                      </ul>
                    )}
                  </section>

                  {deadlineMs && (
                    <section className="assign-suggestion-context">
                      <h4 className="assign-suggestion-outlook-title">Calendar ±2 days</h4>
                      <p className="assign-suggestion-deadline-date">
                        Due: {new Date(deadlineMs).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </p>
                      {calendarAroundDeadline.length === 0 ? (
                        <p className="assign-suggestion-context-empty">No other deadlines</p>
                      ) : (
                        <ul className="assign-suggestion-projects-list">
                          {calendarAroundDeadline.map((a) => (
                            <li key={a.id} className="assign-suggestion-projects-item">
                              <span className="assign-suggestion-projects-title">{a.title}</span>
                              <span className="assign-suggestion-projects-meta">
                                {a.deadline != null && new Date(a.deadline).toLocaleDateString(undefined, { dateStyle: "short" })}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {phase === "no_more" && (
        <div className="assign-no-more">
          <p className="muted">No more suggestions from the AI. You can go back and create the task again, or assign manually from your team.</p>
          <button type="button" className="btn-secondary" onClick={handleBackToForm}>
            Back to form
          </button>
        </div>
      )}

      {loading ? (
        <p className="muted">Loading your team…</p>
      ) : employees.length === 0 ? (
        <div className="invite-box">
          <p className="muted" style={{ margin: "0 0 1rem 0" }}>
            Add at least one employee first (Dashboard → Team → Add employee).
          </p>
          <button type="button" className="btn-primary" onClick={() => navigate("/manager")}>
            Go to Dashboard
          </button>
        </div>
      ) : phase === "form" || phase === "no_more" ? (
        <form onSubmit={handleLaunchTask} className="project-form assign-form">
          <label className="assign-form-label assign-form-label--full">
            Title
            <input
              value={newProject.title}
              onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
              placeholder="e.g. Build X"
              required
            />
          </label>
          <label className="assign-form-label assign-form-label--full">
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
          <div className="assign-form-label assign-form-label--full">
            <span className="assign-form-label-text">Skills required</span>
            <TagInput
              value={newProject.skillsRequired ?? []}
              onChange={(skillsRequired) => setNewProject({ ...newProject, skillsRequired })}
              placeholder="Type a skill and press Enter"
              className="assign-form-tag-input"
              aria-label="Skills required"
            />
          </div>
          <label className="assign-form-label assign-form-label--checkbox assign-form-label--full">
            <input
              type="checkbox"
              checked={newProject.trainingForLowerLevel ?? false}
              onChange={(e) => setNewProject({ ...newProject, trainingForLowerLevel: e.target.checked })}
            />
            <span>Can be used as training for lower-level employees</span>
          </label>
          <div className="form-actions">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Finding match…" : "Find best match (AI)"}
            </button>
            <button type="button" onClick={() => navigate("/manager")} className="btn-secondary">
              Back to Dashboard
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
