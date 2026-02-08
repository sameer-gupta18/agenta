import React, { useState, useEffect, useCallback } from "react";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { ProjectAssignment } from "../types";
import { FiCheckCircle, FiBriefcase, FiUserPlus } from "react-icons/fi";
import "./ManagerDashboard.css";

export function ManagerCompleted() {
  const { user } = useAuth();
  const [assignmentsCreated, setAssignmentsCreated] = useState<ProjectAssignment[]>([]);
  const [assignmentsAssignedToMe, setAssignmentsAssignedToMe] = useState<ProjectAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!user?.uid) return;
    setLoading(true);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const byMe = yield* fs.getAssignmentsByManager(user.uid);
      const toMe = yield* fs.getAssignmentsAssignedTo(user.uid);
      return {
        byMe: (byMe ?? []).filter((a) => a.status === "completed"),
        toMe: (toMe ?? []).filter((a) => a.status === "completed"),
      };
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(({ byMe, toMe }) => {
        setAssignmentsCreated(byMe);
        setAssignmentsAssignedToMe(toMe);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

  return (
    <div className="manager-dash manager-dash--page">
      <h1 className="manager-page-title">
        {React.createElement(FiCheckCircle as any)} Completed tasks
      </h1>
      <p className="muted" style={{ marginBottom: "1.5rem" }}>
        Completed tasks. Active tasks are on the Dashboard.
      </p>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {assignmentsAssignedToMe.length > 0 && (
            <section className="section section--assigned-to-me">
              <h2>{React.createElement(FiUserPlus as any)} Completed — assigned to you</h2>
              <ul className="assignment-list">
                {assignmentsAssignedToMe.map((a) => (
                  <li key={a.id} className="assignment-card status-done">
                    <div className="assign-title">{a.title}</div>
                    <div className="assign-meta">
                      From {a.assignedByName} → {a.assignedToName} · {a.importance} · {a.timeline}
                      {a.deadline != null && (
                        <span> · Deadline: {new Date(a.deadline).toLocaleDateString()}</span>
                      )}
                      {a.completedAt != null && (
                        <span> · Completed: {new Date(a.completedAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="section section--created-by-me">
            <h2>{React.createElement(FiBriefcase as any)} Completed — created by you</h2>
            {assignmentsCreated.length === 0 && assignmentsAssignedToMe.length === 0 ? (
              <p className="muted">No completed tasks yet. Completed tasks will appear here.</p>
            ) : (
              <ul className="assignment-list">
                {assignmentsCreated.map((a) => (
                  <li key={a.id} className="assignment-card status-done">
                    <div className="assign-title">{a.title}</div>
                    <div className="assign-meta">
                      → {a.assignedToName} · {a.importance} · {a.timeline}
                      {a.deadline != null && (
                        <span> · Deadline: {new Date(a.deadline).toLocaleDateString()}</span>
                      )}
                      {a.completedAt != null && (
                        <span> · Completed: {new Date(a.completedAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
