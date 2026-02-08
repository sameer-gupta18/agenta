import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { EmployeeProfile, ManagerRecord } from "../types";
import { FiArrowLeft, FiMail } from "react-icons/fi";
import "./EmployeeDashboard.css";

function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&radius=50`;
}

export function EmployeeManagerDetail() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [manager, setManager] = useState<ManagerRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!user?.uid) return;
    setLoading(true);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const prof = yield* fs.getEmployeeProfile(user.uid);
      const mgr = prof?.managerId ? yield* fs.getManager(prof.managerId) : null;
      return { profile: prof ?? null, manager: mgr ?? null };
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(({ profile: prof, manager: mgr }) => {
        setProfile(prof);
        setManager(mgr);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="employee-dash-page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!manager) {
    return (
      <div className="employee-dash-page">
        <Link to="/employee" className="employee-back-link" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem", color: "var(--agenta-text-muted)", textDecoration: "none", fontSize: "0.9rem" }}>
          {React.createElement(FiArrowLeft as any)} Back to dashboard
        </Link>
        <p className="muted">No manager assigned.</p>
      </div>
    );
  }

  return (
    <div className="employee-dash-page">
      <Link to="/employee" className="employee-back-link" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem", color: "var(--agenta-text-muted)", textDecoration: "none", fontSize: "0.9rem" }}>
        {React.createElement(FiArrowLeft as any)} Back to dashboard
      </Link>
      <div className="employee-manager-detail-card">
        <div className="employee-manager-detail__header">
          <img src={getAvatarUrl(manager.uid)} alt="" className="employee-manager-detail__avatar" />
          <div className="employee-manager-detail__headings">
            <h1 className="employee-manager-detail__name">{manager.displayName}</h1>
            {manager.position && <p className="employee-manager-detail__position">{manager.position}</p>}
            {manager.department && <p className="employee-manager-detail__department">{manager.department}</p>}
            <a href={`mailto:${manager.email}`} className="employee-manager-detail__email">
              {React.createElement(FiMail as any)} {manager.email}
            </a>
          </div>
        </div>
        {manager.bio && (
          <div className="employee-manager-detail__bio">
            <h3 className="employee-manager-detail__section-title">About</h3>
            <p className="employee-manager-detail__bio-text">{manager.bio}</p>
          </div>
        )}
        {manager.qualifications && manager.qualifications.length > 0 && (
          <div className="employee-manager-detail__section">
            <h3 className="employee-manager-detail__section-title">Qualifications</h3>
            <ul className="employee-manager-detail__list">
              {manager.qualifications.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
