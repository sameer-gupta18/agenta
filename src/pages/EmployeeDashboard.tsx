import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { ProjectAssignment, EmployeeProfile, ManagerRecord } from "../types";
import { FiBriefcase, FiUser } from "react-icons/fi";
import "./EmployeeDashboard.css";

function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&radius=50`;
}

export function EmployeeDashboard() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [manager, setManager] = useState<ManagerRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!user?.uid) return;
    setLoading(true);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const assigns = yield* fs.getAssignmentsByEmployee(user.uid);
      const prof = yield* fs.getEmployeeProfile(user.uid);
      const mgr = prof?.managerId ? yield* fs.getManager(prof.managerId) : null;
      return { assigns: assigns ?? [], profile: prof ?? null, manager: mgr ?? null };
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(({ assigns, profile: prof, manager: mgr }) => {
        setAssignments(assigns);
        setProfile(prof);
        setManager(mgr);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const activeAssignments = assignments.filter((a) => a.status !== "completed");

  if (!user) return null;

  return (
    <div className="employee-dash-page">
      <h1 className="employee-dash-page__title">My work</h1>

      {manager && (
        <section className="employee-dash-section">
          <h2 className="employee-dash-section__heading">
            {React.createElement(FiUser as any)} Your manager
          </h2>
          <Link to="/employee/manager" className="employee-manager-card">
            <img src={getAvatarUrl(manager.uid)} alt="" className="employee-manager-card__avatar" />
            <div className="employee-manager-card__body">
              <div className="employee-manager-card__name">{manager.displayName}</div>
              {manager.position && <div className="employee-manager-card__meta">{manager.position}</div>}
              {manager.department && <div className="employee-manager-card__meta">{manager.department}</div>}
              <span className="employee-manager-card__email">{manager.email}</span>
            </div>
          </Link>
        </section>
      )}

      <section className="employee-dash-section">
        <h2 className="employee-dash-section__heading">
          {React.createElement(FiBriefcase as any)} Current tasks
        </h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <ul className="employee-task-list">
            {activeAssignments.map((a) => (
              <li key={a.id}>
                <Link to={`/employee/assignment/${a.id}`} className="employee-task-card">
                  <div className="employee-task-card__title">{a.title}</div>
                  <div className="employee-task-card__meta">
                    {a.importance} · {a.timeline}
                    {a.deadline != null && (
                      <> · Due {new Date(a.deadline).toLocaleDateString(undefined, { dateStyle: "short" })}</>
                    )}
                  </div>
                </Link>
              </li>
            ))}
            {activeAssignments.length === 0 && !loading && (
              <li className="muted">No current tasks. Your manager will assign work here.</li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
