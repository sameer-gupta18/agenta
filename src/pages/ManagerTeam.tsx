import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { EmployeeProfile } from "../types";
import { FiUsers } from "react-icons/fi";
import "./ManagerDashboard.css";

function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&radius=50`;
}

export function ManagerTeam() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user?.uid) return;
    setLoading(true);
    setError(null);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      return yield* fs.getEmployeeProfilesByManager(user.uid);
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(setEmployees)
      .catch((e) => setError(e?.message ?? "Failed to load team"))
      .finally(() => setLoading(false));
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

  return (
    <div className="manager-dash manager-dash--page">
      <h1 className="manager-page-title">
        {React.createElement(FiUsers as any)} View your team
      </h1>
      <p className="muted" style={{ marginBottom: "1.5rem" }}>
        Click a team member to view their details and options.
      </p>
      {error && (
        <div className="dash-error">
          {error}
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <ul className="manager-team-grid">
          {employees.map((emp) => (
            <li key={emp.uid}>
              <button
                type="button"
                className="manager-team-card"
                onClick={() => navigate(`/manager/team/${emp.uid}`)}
              >
                <img src={getAvatarUrl(emp.uid)} alt="" className="manager-team-card__avatar" />
                <div className="manager-team-card__body">
                  <div className="manager-team-card__name">{emp.displayName}</div>
                  <div className="manager-team-card__meta">{emp.email}</div>
                  {emp.position && (
                    <div className="manager-team-card__role">{emp.position}</div>
                  )}
                </div>
              </button>
            </li>
          ))}
          {employees.length === 0 && (
            <li className="muted">No team members yet. Add employees from the Dashboard.</li>
          )}
        </ul>
      )}
    </div>
  );
}
