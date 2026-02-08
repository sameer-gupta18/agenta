import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Effect } from "effect";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { ManagerRecord, EmployeeProfile, Role, ProjectAssignment } from "../types";
import { DEFAULT_SKILL_ELO } from "../lib/skillElo";
import { FiArrowLeft, FiUser, FiBook, FiBriefcase, FiUserPlus, FiCheckSquare, FiAward, FiAlertTriangle } from "react-icons/fi";
import "./AdminPersonDetail.css";

function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&radius=50`;
}

export function AdminPersonDetail() {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [role, setRole] = useState<Role | null>(null);
  const [profile, setProfile] = useState<ManagerRecord | EmployeeProfile | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [showFireConfirm, setShowFireConfirm] = useState(false);
  const [firing, setFiring] = useState(false);
  const [fireError, setFireError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!uid) return;
    setLoading(true);
    setError(null);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const personRole = yield* fs.getPersonRole(uid);
      if (!personRole || personRole === "admin") return { role: null, profile: null, managerName: null, assignments: [] };
      if (personRole === "manager") {
        const m = yield* fs.getManager(uid);
        const assigns = yield* fs.getAssignmentsAssignedTo(uid);
        return { role: "manager", profile: m, managerName: null, assignments: assigns ?? [] };
      }
      const emp = yield* fs.getEmployeeProfile(uid);
      if (!emp) return { role: "employee", profile: null, managerName: null, assignments: [] };
      const managers = yield* fs.getManagers();
      const manager = managers.find((x) => x.uid === emp.managerId);
      const assigns = yield* fs.getAssignmentsAssignedTo(uid);
      return { role: "employee", profile: emp, managerName: manager?.displayName ?? null, assignments: assigns ?? [] };
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(({ role: r, profile: p, managerName: mn, assignments: a }) => {
        setRole(r && (r === "manager" || r === "employee") ? r : null);
        setProfile(p ?? null);
        setManagerName(mn ?? null);
        setAssignments(a ?? []);
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!loading && uid && !role && !error) navigate("/admin", { replace: true });
  }, [loading, uid, role, error, navigate]);

  if (!authUser || authUser.role !== "admin") return null;
  if (!uid) {
    navigate("/admin", { replace: true });
    return null;
  }

  if (loading) {
    return (
      <div className="person-detail person-detail--loading">
        <div className="person-detail__loading-dots">
          <span /><span /><span />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="person-detail">
        <button type="button" className="person-detail__back" onClick={() => navigate("/admin")}>
          {React.createElement(FiArrowLeft as any)} Back
        </button>
        <p className="person-detail__error">{error ?? "Person not found."}</p>
      </div>
    );
  }

  const isManager = role === "manager";
  const displayName = profile.displayName;
  const activeAssignments = assignments.filter((a) => a.status === "pending" || a.status === "in_progress");
  const empProfile = !isManager ? (profile as EmployeeProfile) : null;
  const skills = empProfile?.skills ?? [];
  const skillRatings = empProfile?.skillRatings ?? {};
  const experience = empProfile?.experience;
  const workEx = empProfile?.workEx;
  const skillRating = (skill: string) => skillRatings[skill] ?? DEFAULT_SKILL_ELO;

  const handlePromoteToManager = async () => {
    if (!uid || isManager || !profile) return;
    setPromoteError(null);
    setPromoting(true);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      yield* fs.setUserRole(uid, "manager", profile.displayName, profile.email);
      yield* fs.setManagerRecord(uid, {
        email: profile.email,
        displayName: profile.displayName,
        position: profile.position,
        department: profile.department,
        phone: profile.phone,
        gender: profile.gender,
        dateOfBirth: profile.dateOfBirth,
        age: profile.age,
        qualifications: profile.qualifications,
        education: profile.education,
        bio: profile.bio,
      });
    });
    try {
      await Effect.runPromise(runWithAppLayer(program));
      load();
    } catch (e) {
      setPromoteError(e instanceof Error ? e.message : "Failed to promote. Check Firestore rules allow admin to write users and managers.");
    } finally {
      setPromoting(false);
    }
  };

  const handleFirePerson = async () => {
    if (!uid || !authUser || uid === authUser.uid) return;
    setFireError(null);
    setFiring(true);
    try {
      const { getFunctions, httpsCallable } = await import("firebase/functions");
      const { getFirebaseApp } = await import("../config/firebase");
      const fn = getFunctions(getFirebaseApp());
      const firePerson = httpsCallable<{ uid: string }, { ok: boolean }>(fn, "firePerson");
      await firePerson({ uid });
      setShowFireConfirm(false);
      navigate("/admin", { replace: true });
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Failed to remove person.";
      setFireError(msg);
    } finally {
      setFiring(false);
    }
  };

  return (
    <div className="person-detail">
      <motion.button
        type="button"
        className="person-detail__back"
        onClick={() => navigate("/admin")}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
      >
        {React.createElement(FiArrowLeft as any)} Back to Current Workflows
      </motion.button>

      <motion.header
        className="person-detail__header person-detail__header--block"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="person-detail__header-inner">
          <div className="person-detail__avatar-wrap person-detail__avatar-wrap--block">
            <img src={getAvatarUrl(uid!)} alt="" className="person-detail__avatar-img" />
          </div>
          <div className="person-detail__header-text">
            <h1 className="person-detail__name">{displayName}</h1>
            <p className="person-detail__meta">
              {profile.position ?? (isManager ? "Manager" : "Employee")}
              {profile.department && ` · ${profile.department}`}
            </p>
            <p className="person-detail__email">{profile.email}</p>
            {!isManager && managerName && (
              <p className="person-detail__manager">Reports to {managerName}</p>
            )}
            {!isManager && (
              <div className="person-detail__promote-wrap">
                {promoteError && <p className="person-detail__promote-error">{promoteError}</p>}
                <button
                  type="button"
                  className="person-detail__promote-btn"
                  onClick={handlePromoteToManager}
                  disabled={promoting}
                >
                  {React.createElement(FiUserPlus as any)} {promoting ? "Promoting…" : "Make manager"}
                </button>
              </div>
            )}
            {uid !== authUser?.uid && (
              <div className="person-detail__fire-wrap" style={{ marginTop: "0.75rem" }}>
                <button
                  type="button"
                  className="person-detail__fire-btn"
                  onClick={() => setShowFireConfirm(true)}
                  style={{ color: "var(--error, #c00)", borderColor: "var(--error, #c00)" }}
                >
                  {React.createElement(FiAlertTriangle as any)} Remove from system
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.header>

      {showFireConfirm && (
        <div className="modal-overlay" onClick={() => !firing && setShowFireConfirm(false)} role="presentation">
          <div className="modal-content" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>Remove from system</h3>
            <p className="muted">
              Are you sure you want to remove {displayName}? They will be deleted from authentication and will no longer have access. This cannot be undone.
            </p>
            {fireError && <p className="dash-error" style={{ marginTop: "0.75rem" }}>{fireError}</p>}
            <div className="form-actions" style={{ marginTop: "1rem" }}>
              <button type="button" className="btn-primary" onClick={handleFirePerson} disabled={firing} style={{ background: "var(--error, #c00)" }}>
                {firing ? "Removing…" : "Remove"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowFireConfirm(false)} disabled={firing}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="person-detail__grid">
        {activeAssignments.length > 0 && (
          <motion.section
            className="person-detail__card person-detail__card--current-task"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <h2 className="person-detail__card-title">
              {React.createElement(FiCheckSquare as any)} Current task{activeAssignments.length > 1 ? "s" : ""}
            </h2>
            <div className="person-detail__task-list">
              {activeAssignments.map((a) => (
                <div key={a.id} className="person-detail__task-card">
                  <div className="person-detail__task-title">{a.title}</div>
                  {a.description && <p className="person-detail__task-desc">{a.description}</p>}
                  <div className="person-detail__task-meta">
                    <span className={`person-detail__task-status person-detail__task-status--${a.status}`}>{a.status.replace("_", " ")}</span>
                    <span className="person-detail__task-importance">{a.importance}</span>
                    <span className="person-detail__task-timeline">{a.timeline}</span>
                    {a.assignedByName && <span className="person-detail__task-assigned">Assigned by {a.assignedByName}</span>}
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        <motion.section
          className="person-detail__card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="person-detail__card-title">
            {React.createElement(FiUser as any)} Basic info
          </h2>
          <dl className="person-detail__dl">
            {profile.gender != null && profile.gender !== "" && (
              <>
                <dt>Gender</dt>
                <dd>{profile.gender}</dd>
              </>
            )}
            {profile.dateOfBirth != null && profile.dateOfBirth !== "" && (
              <>
                <dt>Date of birth</dt>
                <dd>{profile.dateOfBirth}</dd>
              </>
            )}
            {profile.age != null && (
              <>
                <dt>Age</dt>
                <dd>{profile.age}</dd>
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
            {!("gender" in profile && profile.gender) && !profile.dateOfBirth && !profile.phone && !profile.bio && (
              <dd className="person-detail__empty">No basic info yet.</dd>
            )}
          </dl>
        </motion.section>

        <motion.section
          className="person-detail__card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h2 className="person-detail__card-title">
            {React.createElement(FiBook as any)} Education & qualifications
          </h2>
          {profile.education && profile.education.length > 0 && (
            <div className="person-detail__list-block">
              <dt>Education</dt>
              <ul>
                {profile.education.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {profile.qualifications && profile.qualifications.length > 0 && (
            <div className="person-detail__list-block">
              <dt>Qualifications</dt>
              <ul>
                {profile.qualifications.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          {empProfile?.resume && (
            <div className="person-detail__list-block">
              <dt>Resume</dt>
              <dd className="person-detail__resume">{empProfile.resume}</dd>
            </div>
          )}
          {skills.length > 0 ? (
            <div className="person-detail__list-block">
              <dt>Skills</dt>
              <ul className="person-detail__tags person-detail__tags--with-rating">
                {skills.map((s, i) => (
                  <li key={i} className="person-detail__skill-with-rating">
                    <span>{s}</span>
                    <span className="person-detail__skill-elo">{(skillRating(s))}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {(!profile.education?.length && !profile.qualifications?.length) &&
            !(empProfile?.resume || skills.length) && (
            <p className="person-detail__empty">No education or qualifications yet.</p>
          )}
        </motion.section>

        {!isManager && (
          <motion.section
            className="person-detail__card person-detail__card--skills-experience"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
          >
            <h2 className="person-detail__card-title">
              {React.createElement(FiAward as any)} Skills & experience
            </h2>
            {skills.length > 0 && (
              <div className="person-detail__skills-block">
                <h3 className="person-detail__skills-heading">Skills (Elo rating)</h3>
                <p className="person-detail__skills-intro">Rating updates when projects are completed. Higher = stronger track record.</p>
                <ul className="person-detail__skills-tags">
                  {skills.map((s, i) => (
                    <li key={i} className="person-detail__skill-tag person-detail__skill-tag--rated">
                      <span>{s}</span>
                      <span className="person-detail__skill-tag-elo">{(skillRating(s))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(experience || workEx) && (
              <div className="person-detail__experience-block">
                <h3 className="person-detail__experience-heading">Experience</h3>
                {experience && (
                  <div className="person-detail__experience-summary">
                    <span className="person-detail__experience-label">Summary</span>
                    <p className="person-detail__experience-text">{experience}</p>
                  </div>
                )}
                {workEx && (
                  <div className="person-detail__experience-detail">
                    <span className="person-detail__experience-label">Work history</span>
                    <p className="person-detail__experience-text person-detail__experience-text--pre">{workEx}</p>
                  </div>
                )}
              </div>
            )}
            {skills.length === 0 && !experience && !workEx && (
              <p className="person-detail__empty">No skills or experience noted yet.</p>
            )}
          </motion.section>
        )}

        {assignments.length > 0 && (
          <motion.section
            className="person-detail__card person-detail__card--timeline"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
          >
            <h2 className="person-detail__card-title">
              {React.createElement(FiBriefcase as any)} Project timeline
            </h2>
            <p className="person-detail__timeline-intro">Projects undertaken. Hover over a project for details.</p>
            <div className="person-detail__timeline">
              {[...assignments]
                .sort((a, b) => a.createdAt - b.createdAt)
                .map((a) => (
                  <div key={a.id} className="person-detail__timeline-item">
                    <div className="person-detail__timeline-dot" />
                    <div className="person-detail__timeline-card">
                      <div className="person-detail__timeline-card-title">{a.title}</div>
                      <div className="person-detail__timeline-card-date">
                        {new Date(a.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                        {a.status === "completed" && a.completedAt
                          ? ` → ${new Date(a.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                          : ""}
                      </div>
                      <div className="person-detail__timeline-card-hover">
                        <div className="person-detail__timeline-hover-row">
                          <span className="person-detail__timeline-hover-label">Assigned by</span>
                          <span className="person-detail__timeline-hover-value">{a.assignedByName ?? "—"}</span>
                        </div>
                        {(a.skillsUsed?.length ?? 0) > 0 && (
                          <div className="person-detail__timeline-hover-row">
                            <span className="person-detail__timeline-hover-label">Skills used (niche)</span>
                            <div className="person-detail__timeline-hover-skills">
                              {a.skillsUsed!.map((s, i) => (
                                <span key={i} className="person-detail__timeline-skill-tag">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </motion.section>
        )}

      </div>
    </div>
  );
}
