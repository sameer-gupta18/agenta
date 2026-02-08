import React, { useState, useEffect, useCallback } from "react";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { EmployeeProfile, ManagerRecord } from "../types";
import { FiUsers } from "react-icons/fi";
import "./EmployeeDashboard.css";

function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&radius=50`;
}

export function EmployeeTeam() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [manager, setManager] = useState<ManagerRecord | null>(null);
  const [peers, setPeers] = useState<(EmployeeProfile | ManagerRecord)[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!user?.uid) return;
    setLoading(true);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const prof = yield* fs.getEmployeeProfile(user.uid);
      if (!prof?.managerId) return { profile: prof ?? null, manager: null, peers: [] };
      const mgr = yield* fs.getManager(prof.managerId);
      const employeeProfiles = yield* fs.getEmployeeProfilesByManager(prof.managerId);
      const peerEmployees = employeeProfiles.filter((e) => e.uid !== user.uid);
      return { profile: prof, manager: mgr ?? null, peers: peerEmployees };
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(({ profile: p, manager: m, peers: pList }) => {
        setProfile(p);
        setManager(m);
        setPeers(pList);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

  return (
    <div className="employee-dash-page">
      <h1 className="employee-dash-page__title">
        {React.createElement(FiUsers as any)} View your team
      </h1>
      <p className="muted" style={{ marginBottom: "1.5rem" }}>
        Teammates with the same manager.
      </p>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : peers.length === 0 ? (
        <p className="muted">No teammates yet.</p>
      ) : (
        <ul className="employee-team-list" style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {peers.map((p) => (
            <li key={p.uid}>
              <div className="employee-manager-card">
                <img src={getAvatarUrl(p.uid)} alt="" className="employee-manager-card__avatar" />
                <div className="employee-manager-card__body">
                  <div className="employee-manager-card__name">{p.displayName}</div>
                  {"position" in p && p.position && <div className="employee-manager-card__meta">{p.position}</div>}
                  {"department" in p && p.department && <div className="employee-manager-card__meta">{p.department}</div>}
                  {"email" in p && <span className="employee-manager-card__email">{p.email}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
