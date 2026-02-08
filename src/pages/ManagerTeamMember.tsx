import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { EmployeeProfile, ProjectAssignment } from "../types";
import { FiArrowLeft, FiUser, FiBook, FiBriefcase } from "react-icons/fi";
import { DEFAULT_SKILL_ELO } from "../lib/skillElo";
import "./ManagerTeamMember.css";
import "./ManagerDashboard.css";

function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&radius=50`;
}

export function ManagerTeamMember() {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFireConfirm, setShowFireConfirm] = useState(false);
  const [firing, setFiring] = useState(false);
  const [fireMessage, setFireMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !user?.uid) return;
    setLoading(true);
    setError(null);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const emp = yield* fs.getEmployeeProfile(uid);
      if (!emp || emp.managerId !== user.uid) return { profile: null, assignments: [] };
      const assigns = yield* fs.getAssignmentsByEmployee(uid);
      return { profile: emp, assignments: assigns ?? [] };
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(({ profile: p, assignments: a }) => {
        setProfile(p);
        setAssignments(a ?? []);
        if (!p) setError("Team member not found or not under your team.");
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [uid, user?.uid]);

  if (!user) return null;
  const skillRating = (skill: string) => (profile?.skillRatings ?? {})[skill] ?? DEFAULT_SKILL_ELO;
  const activeAssignments = assignments.filter((a) => a.status === "pending" || a.status === "in_progress");

  if (loading) {
    return (
      <div className="manager-dash manager-dash--page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="manager-dash manager-dash--page">
        <button type="button" onClick={() => navigate("/manager/team")} className="manager-back">
          {React.createElement(FiArrowLeft as any)} Back to team
        </button>
        <p className="muted">{error ?? "Not found."}</p>
      </div>
    );
  }

  return (
    <div className="manager-dash manager-dash--page manager-dash--member-full">
      <button type="button" onClick={() => navigate("/manager/team")} className="manager-back">
        {React.createElement(FiArrowLeft as any)} Back to team
      </button>

      <header className="manager-member-hero">
        <div className="manager-member-hero-avatar-wrap">
          <img src={getAvatarUrl(profile.uid)} alt="" className="manager-member-hero-avatar" />
        </div>
        <div className="manager-member-hero-text">
          <h1 className="manager-member-hero-name">{profile.displayName}</h1>
          <p className="manager-member-hero-email">{profile.email}</p>
          {profile.position && <p className="manager-member-hero-role">{profile.position}</p>}
          {profile.department && <p className="manager-member-hero-dept">{profile.department}</p>}
          {profile.bio && (
            <p className="manager-member-hero-bio">{profile.bio}</p>
          )}
        </div>
      </header>

      <section className="manager-member-card">
        <h2 className="manager-member-card-title">{React.createElement(FiUser as any)} Basic info</h2>
        <dl className="manager-member-dl">
          {profile.gender != null && profile.gender !== "" && (
            <>
              <dt>Gender</dt>
              <dd>{profile.gender}</dd>
            </>
          )}
          {profile.phone != null && profile.phone !== "" && (
            <>
              <dt>Phone</dt>
              <dd>{profile.phone}</dd>
            </>
          )}
          {profile.bio != null && profile.bio !== "" && (
            <>
              <dt>Bio</dt>
              <dd>{profile.bio}</dd>
            </>
          )}
          {!profile.gender && !profile.phone && !profile.bio && (
            <dd className="manager-member-empty">No basic info yet.</dd>
          )}
        </dl>
      </section>

      <section className="manager-member-card">
        <h2 className="manager-member-card-title">{React.createElement(FiBook as any)} Education & qualifications</h2>
        {profile.education && profile.education.length > 0 && (
          <div className="manager-member-list-block">
            <dt>Education</dt>
            <ul>
              {profile.education.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {profile.qualifications && profile.qualifications.length > 0 && (
          <div className="manager-member-list-block">
            <dt>Qualifications</dt>
            <ul>
              {profile.qualifications.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}
        {profile.skills && profile.skills.length > 0 && (
          <div className="manager-member-list-block">
            <dt>Skills</dt>
            <ul className="manager-member-tags">
              {profile.skills.map((s, i) => (
                <li key={i}>
                  <span>{s}</span>
                  <span className="manager-member-elo">{skillRating(s)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {(!profile.education?.length && !profile.qualifications?.length && !profile.skills?.length) && (
          <p className="manager-member-empty">No education or qualifications yet.</p>
        )}
      </section>

      <section className="manager-member-card">
        <h2 className="manager-member-card-title">{React.createElement(FiBriefcase as any)} Assignments</h2>
        {activeAssignments.length > 0 ? (
          <ul className="manager-member-assign-list">
            {activeAssignments.map((a) => (
              <li key={a.id} className="manager-member-assign-item">
                <span className="manager-member-assign-title">{a.title}</span>
                <span className="manager-member-assign-meta">{a.status} · {a.importance}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="manager-member-empty">No active assignments.</p>
        )}
      </section>

    </div>
  );
}
