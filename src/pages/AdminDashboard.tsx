import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Effect } from "effect";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { ManagerRecord, EmployeeProfile, ProjectAssignment } from "../types";
import { FiPlus, FiLogOut, FiSun, FiMoon, FiSend, FiBell, FiUserPlus } from "react-icons/fi";
import { OrgHierarchyFlow } from "../components/OrgHierarchyFlow";
import Lenis from "lenis";
import "./AdminDashboard.css";

const INVITE_EXPIRY_DAYS = 7;

/** Deterministic avatar URL (DiceBear). Same seed = same avatar. */
function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&radius=50`;
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [managers, setManagers] = useState<ManagerRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteReportsTo, setInviteReportsTo] = useState<string>("");
  const [invitePosition, setInvitePosition] = useState<string>("");
  const [inviteDepartment, setInviteDepartment] = useState<string>("");
  const [addType, setAddType] = useState<"manager" | "employee">("manager");
  const [empEmail, setEmpEmail] = useState("");
  const [empPassword, setEmpPassword] = useState("");
  const [empDisplayName, setEmpDisplayName] = useState("");
  const [empPosition, setEmpPosition] = useState("");
  const [empDepartment, setEmpDepartment] = useState("");
  const [empManagerId, setEmpManagerId] = useState("");
  const [addEmployeeError, setAddEmployeeError] = useState<string | null>(null);
  const [addEmployeeSubmitting, setAddEmployeeSubmitting] = useState(false);
  const [addEmployeeSuccess, setAddEmployeeSuccess] = useState(false);
  const [globalNotifTitle, setGlobalNotifTitle] = useState<string>("");
  const [globalNotifBody, setGlobalNotifBody] = useState<string>("");
  const [globalNotifSending, setGlobalNotifSending] = useState(false);
  const [globalNotifSent, setGlobalNotifSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hierarchyRef = useRef<HTMLElement>(null);
  const managersRef = useRef<HTMLElement>(null);
  const hierarchyInView = useInView(hierarchyRef, { once: true, margin: "-80px" });
  const managersInView = useInView(managersRef, { once: true, margin: "-80px" });

  const load = useCallback(() => {
    setLoading(true);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const managersList = yield* fs.getManagers();
      const employeesList = yield* fs.getAllEmployeeProfiles();
      const assignmentsList = yield* fs.getAllAssignments();
      return { managersList, employeesList, assignmentsList };
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(({ managersList, employeesList, assignmentsList }) => {
        setManagers(managersList);
        setEmployees(employeesList);
        setAssignments(assignmentsList);
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const lenis = new Lenis({ smoothWheel: true, lerp: 0.08 });
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);

  const handleSendGlobalNotification = () => {
    const title = globalNotifTitle.trim();
    const body = globalNotifBody.trim();
    if (!title) return;
    setError(null);
    setGlobalNotifSent(false);
    setGlobalNotifSending(true);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      yield* fs.createGlobalNotification(title, body || title);
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(() => {
        setGlobalNotifSent(true);
        setGlobalNotifTitle("");
        setGlobalNotifBody("");
      })
      .catch((e) => setError(e?.message ?? "Failed to send notification"))
      .finally(() => setGlobalNotifSending(false));
  };

  const handleCreateManagerInvite = () => {
    if (!user?.uid) return;
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const reportsTo = inviteReportsTo.trim() || null;
    const reportsToDisplayName = reportsTo ? managers.find((m) => m.uid === reportsTo)?.displayName : undefined;
    const position = invitePosition.trim() || undefined;
    const department = inviteDepartment.trim() || undefined;
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      yield* fs.createManagerInvite(token, user.uid, expiresAt, reportsTo, reportsToDisplayName, position, department);
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(() => {
        const base = window.location.origin;
        const link = `${base}/signup?role=manager&managerInvite=${encodeURIComponent(token)}`;
        setInviteLink(link);
        navigator.clipboard.writeText(link).catch(() => {});
      })
      .catch((e) => setError(e?.message ?? "Failed to create invite"));
  };

  const getCreateEmployeeErrorMessage = (err: unknown): string => {
    if (!err || typeof err !== "object") return "Failed to create employee.";
    const o = err as { message?: string; code?: string };
    const code = typeof o.code === "string" ? o.code : "";
    const msg = typeof o.message === "string" ? o.message.trim() : "";
    if (code === "functions/already-exists" || code === "already-exists") return "An account with this email already exists.";
    if (code === "functions/permission-denied" || code === "permission-denied") return "You don't have permission to create employees.";
    if (code === "functions/invalid-argument" || code === "invalid-argument") return msg || "Please check all required fields and try again.";
    if (code === "functions/internal" || code === "internal") return "Could not create account. The email may already be in use. Please try again.";
    if (msg && !msg.toLowerCase().includes("internal")) return msg;
    return "Failed to create employee. Please try again.";
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddEmployeeError(null);
    setAddEmployeeSuccess(false);
    const email = empEmail.trim();
    const password = empPassword;
    const managerId = empManagerId.trim();
    const position = empPosition.trim();
    const department = empDepartment.trim();
    if (!email) {
      setAddEmployeeError("Email is required.");
      return;
    }
    if (password.length < 6) {
      setAddEmployeeError("Password must be at least 6 characters.");
      return;
    }
    if (!managerId) {
      setAddEmployeeError("Please select a manager.");
      return;
    }
    if (!position) {
      setAddEmployeeError("Position is required.");
      return;
    }
    if (!department) {
      setAddEmployeeError("Department is required.");
      return;
    }
    setAddEmployeeSubmitting(true);
    try {
      const { getFunctions, httpsCallable } = await import("firebase/functions");
      const { getFirebaseApp } = await import("../config/firebase");
      const fn = getFunctions(getFirebaseApp());
      const createEmployee = httpsCallable<
        { email: string; password: string; displayName: string; managerId: string; position: string; department: string },
        { uid: string }
      >(fn, "createEmployee");
      await createEmployee({
        email,
        password,
        displayName: empDisplayName.trim() || email.split("@")[0],
        managerId,
        position,
        department,
      });
      setEmpEmail("");
      setEmpPassword("");
      setEmpDisplayName("");
      setEmpPosition("");
      setEmpDepartment("");
      setEmpManagerId("");
      setAddEmployeeSuccess(true);
      load();
    } catch (err: unknown) {
      setAddEmployeeError(getCreateEmployeeErrorMessage(err));
    } finally {
      setAddEmployeeSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="admin-dash">
      <header className="admin-header">
        <div className="admin-header__brand">
          <img src="/assets/logo.png" alt="Agenta" className="admin-header__logo" />
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            onClick={toggleTheme}
            className="admin-header__theme-btn"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? React.createElement(FiSun as any) : React.createElement(FiMoon as any)}
          </button>
          <div className="admin-header__user">
            <button
              type="button"
              className="admin-header__avatar-btn"
              onClick={() => navigate("/admin/people/" + user.uid)}
              title="View profile"
            >
              <div className="admin-header__avatar">
                <img src={getAvatarUrl(user.uid)} alt="" />
              </div>
            </button>
            <span className="user-name">{user.displayName || user.email}</span>
          </div>
          <motion.button
            type="button"
            onClick={signOut}
            className="btn-icon"
            title="Sign out"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            {React.createElement(FiLogOut as any)}
          </motion.button>
        </div>
      </header>

      <AnimatePresence>
        {error && (
          <motion.div
            className="dash-error"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {error}
            <button type="button" onClick={() => setError(null)}>Dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.section
        ref={hierarchyRef}
        className="section section--workflows"
        initial={{ opacity: 0, y: 24 }}
        animate={hierarchyInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
      >
        <h2 className="section__heading section__heading--hello">Hello Admin</h2>
        <OrgHierarchyFlow managers={managers} employees={employees} assignments={assignments} loading={loading} />
      </motion.section>

      <section className="section section--invite section--global-notif">
        <div className="admin-panel admin-panel--notification">
          <div className="admin-panel__header">
            <span className="admin-panel__icon" aria-hidden>{React.createElement(FiBell as any)}</span>
            <div>
              <h2 className="admin-panel__title">Global notification</h2>
              <p className="admin-panel__desc">Send a notification to all users (managers and employees).</p>
            </div>
          </div>
          <div className="admin-panel__body global-notif-form">
            <label className="admin-field">
              <span className="admin-field__label">Title</span>
              <input
                type="text"
                value={globalNotifTitle}
                onChange={(e) => setGlobalNotifTitle(e.target.value)}
                className="admin-field__input"
                placeholder="e.g. System maintenance tonight"
                aria-label="Notification title"
              />
            </label>
            <label className="admin-field">
              <span className="admin-field__label">Message</span>
              <textarea
                value={globalNotifBody}
                onChange={(e) => setGlobalNotifBody(e.target.value)}
                className="admin-field__input admin-field__textarea"
                placeholder="Optional message body"
                rows={3}
                aria-label="Notification message"
              />
            </label>
            {globalNotifSent && <p className="admin-panel__success">Notification sent to everyone.</p>}
            <button
              type="button"
              onClick={handleSendGlobalNotification}
              disabled={globalNotifSending || !globalNotifTitle.trim()}
              className="admin-btn admin-btn--primary admin-btn--block"
            >
              {React.createElement(FiSend as any)} {globalNotifSending ? "Sending…" : "Send to everyone"}
            </button>
          </div>
        </div>
      </section>

      <section className="section section--invite">
        <div className="admin-panel admin-panel--add-person">
          <div className="admin-panel__header">
            <span className="admin-panel__icon" aria-hidden>{React.createElement(FiUserPlus as any)}</span>
            <div>
              <h2 className="admin-panel__title">Add person</h2>
              <p className="admin-panel__desc">Invite a new manager or create an employee account.</p>
            </div>
          </div>
          <div className="admin-panel__body">
            <div className="admin-segmented" role="tablist" aria-label="Add manager or employee">
              <button
                type="button"
                role="tab"
                aria-selected={addType === "manager"}
                className={`admin-segmented__option${addType === "manager" ? " admin-segmented__option--active" : ""}`}
                onClick={() => { setAddType("manager"); setAddEmployeeError(null); setAddEmployeeSuccess(false); }}
              >
                Add manager
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={addType === "employee"}
                className={`admin-segmented__option${addType === "employee" ? " admin-segmented__option--active" : ""}`}
                onClick={() => { setAddType("employee"); setInviteLink(null); setShowInviteForm(false); }}
              >
                Add employee
              </button>
            </div>

        {addType === "manager" && (
          <>
            {inviteLink ? (
              <motion.div
                className="admin-invite-box"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <p className="admin-invite-box__text">Share this link with the new manager (valid for {INVITE_EXPIRY_DAYS} days):</p>
                <code className="admin-invite-box__code">{inviteLink}</code>
                <p className="admin-invite-box__copied">Copied to clipboard.</p>
                <button type="button" onClick={() => { setInviteLink(null); setShowInviteForm(false); }} className="admin-btn admin-btn--secondary">
                  Close
                </button>
              </motion.div>
            ) : showInviteForm ? (
              <motion.div
                className="admin-form"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <label className="admin-field">
                  <span className="admin-field__label">This manager will report to</span>
                  <select
                    value={inviteReportsTo}
                    onChange={(e) => setInviteReportsTo(e.target.value)}
                    className="admin-field__input admin-field__select"
                    aria-label="Reports to"
                  >
                    <option value="">None (independent team)</option>
                    {managers.map((m) => (
                      <option key={m.uid} value={m.uid}>
                        {m.displayName}
                        {m.position ? ` (${m.position})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">Position</span>
                  <input
                    type="text"
                    value={invitePosition}
                    onChange={(e) => setInvitePosition(e.target.value)}
                    className="admin-field__input"
                    placeholder="e.g. Engineering Manager"
                    aria-label="Position"
                  />
                </label>
                <label className="admin-field">
                  <span className="admin-field__label">Department</span>
                  <input
                    type="text"
                    value={inviteDepartment}
                    onChange={(e) => setInviteDepartment(e.target.value)}
                    className="admin-field__input"
                    placeholder="e.g. Engineering"
                    aria-label="Department"
                  />
                </label>
                <div className="admin-form__actions">
                  <motion.button
                    type="button"
                    onClick={handleCreateManagerInvite}
                    className="admin-btn admin-btn--primary admin-btn--block"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    {React.createElement(FiPlus as any)} Create manager invite link
                  </motion.button>
                  <button type="button" onClick={() => setShowInviteForm(false)} className="admin-btn admin-btn--secondary">
                    Cancel
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                type="button"
                onClick={() => setShowInviteForm(true)}
                className="admin-btn admin-btn--primary admin-btn--block"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                {React.createElement(FiPlus as any)} Invite manager
              </motion.button>
            )}
          </>
        )}

        {addType === "employee" && (
          <motion.div
            className="admin-form"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p className="admin-panel__desc" style={{ marginBottom: "1rem" }}>Create an employee account and assign them to a manager.</p>
            <form onSubmit={handleCreateEmployee} className="admin-form__form">
              <label className="admin-field">
                <span className="admin-field__label">Email (required)</span>
                <input
                  type="email"
                  value={empEmail}
                  onChange={(e) => setEmpEmail(e.target.value)}
                  className="admin-field__input"
                  placeholder="employee@company.com"
                  required
                  aria-label="Employee email"
                />
              </label>
              <label className="admin-field">
                <span className="admin-field__label">Password (min 6 characters)</span>
                <input
                  type="password"
                  value={empPassword}
                  onChange={(e) => setEmpPassword(e.target.value)}
                  className="admin-field__input"
                  placeholder="••••••••"
                  required
                  minLength={6}
                  aria-label="Password"
                />
              </label>
              <label className="admin-field">
                <span className="admin-field__label">Display name</span>
                <input
                  type="text"
                  value={empDisplayName}
                  onChange={(e) => setEmpDisplayName(e.target.value)}
                  className="admin-field__input"
                  placeholder="Optional; defaults to email prefix"
                  aria-label="Display name"
                />
              </label>
              <label className="admin-field">
                <span className="admin-field__label">Assign to manager (required)</span>
                <select
                  value={empManagerId}
                  onChange={(e) => setEmpManagerId(e.target.value)}
                  className="admin-field__input admin-field__select"
                  required
                  aria-label="Manager"
                >
                  <option value="">Select a manager</option>
                  {managers.map((m) => (
                    <option key={m.uid} value={m.uid}>
                      {m.displayName}
                      {m.position ? ` (${m.position})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span className="admin-field__label">Position (required)</span>
                <input
                  type="text"
                  value={empPosition}
                  onChange={(e) => setEmpPosition(e.target.value)}
                  className="admin-field__input"
                  placeholder="e.g. Software Engineer"
                  required
                  aria-label="Position"
                />
              </label>
              <label className="admin-field">
                <span className="admin-field__label">Department (required)</span>
                <input
                  type="text"
                  value={empDepartment}
                  onChange={(e) => setEmpDepartment(e.target.value)}
                  className="admin-field__input"
                  placeholder="e.g. Engineering"
                  required
                  aria-label="Department"
                />
              </label>
              {addEmployeeError && <p className="admin-form__error">{addEmployeeError}</p>}
              {addEmployeeSuccess && <p className="admin-panel__success">Employee created. They can sign in with the email and password you set.</p>}
              <button type="submit" disabled={addEmployeeSubmitting} className="admin-btn admin-btn--primary admin-btn--block">
                {React.createElement(FiPlus as any)} {addEmployeeSubmitting ? "Creating…" : "Create employee"}
              </button>
            </form>
          </motion.div>
        )}
          </div>
        </div>
      </section>

      <section ref={managersRef} className="section section--card">
        <motion.h2
          className="section__heading section__heading--standalone"
          initial={{ opacity: 0, x: -10 }}
          animate={managersInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.35 }}
        >
          Managers
        </motion.h2>
        {loading ? (
          <motion.div className="loading-dots" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <span /><span /><span />
          </motion.div>
        ) : (
          <ul className="manager-list">
            {managers.map((m, i) => (
              <motion.li
                key={m.uid}
                initial={{ opacity: 0, y: 12 }}
                animate={managersInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.05 * i, duration: 0.3 }}
              >
                <button
                  type="button"
                  className="manager-card"
                  onClick={() => navigate("/admin/people/" + m.uid)}
                >
                  <div className="manager-card__avatar">
                    <img src={getAvatarUrl(m.uid)} alt="" />
                  </div>
                  <div className="manager-card__info">
                    <div className="manager-name">{m.displayName}</div>
                    {(m.position || m.department) && (
                      <div className="manager-meta">{[m.position, m.department].filter(Boolean).join(" · ")}</div>
                    )}
                    <div className="manager-email">{m.email}</div>
                  </div>
                </button>
              </motion.li>
            ))}
            {managers.length === 0 && !loading && (
              <li className="muted">No managers yet. Create an invite link above.</li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
