import React, { useState, useEffect, useCallback, useRef } from "react";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { ProjectAssignment, Notification } from "../types";
import { FiBriefcase, FiLogOut, FiHelpCircle, FiBell } from "react-icons/fi";
import "./EmployeeDashboard.css";

export function EmployeeDashboard() {
  const { user, signOut } = useAuth();
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [managerId, setManagerId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [helpSending, setHelpSending] = useState(false);
  const [helpSent, setHelpSent] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      return yield* fs.subscribeNotifications(user.uid, setNotifications);
    });
    let unsub: (() => void) | undefined;
    Effect.runPromise(runWithAppLayer(program)).then((u) => { unsub = u; }).catch(() => {});
    return () => { unsub?.(); };
  }, [user?.uid]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
    }
    if (showNotifs) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNotifs]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const markRead = (id: string) => {
    Effect.runPromise(runWithAppLayer(Effect.gen(function* () {
      const fs = yield* FirestoreService;
      yield* fs.markNotificationRead(id);
    }))).catch(() => {});
  };

  const load = useCallback(() => {
    if (!user?.uid) return;
    setLoading(true);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const assigns = yield* fs.getAssignmentsByEmployee(user.uid);
      const profile = yield* fs.getEmployeeProfile(user.uid);
      return { assigns: assigns ?? [], managerId: profile?.managerId ?? null };
    });
    const run = runWithAppLayer(program);
    Effect.runPromise(run)
      .then(({ assigns, managerId: mid }) => {
        setAssignments(assigns);
        setManagerId(mid ?? null);
      })
      .catch(() => setAssignments([]))
      .finally(() => setLoading(false));
  }, [user?.uid]);

  const handleRequestHelp = useCallback(async () => {
    if (!user?.uid || !managerId) return;
    setHelpSending(true);
    setHelpSent(false);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      yield* fs.createNotification({
        userId: managerId,
        type: "help_request",
        title: "Help requested",
        body: `${user.displayName || "An employee"} is requesting help.`,
        read: false,
        metadata: { fromUserId: user.uid, fromUserName: user.displayName ?? "" },
      });
    });
    try {
      await Effect.runPromise(runWithAppLayer(program));
      setHelpSent(true);
    } finally {
      setHelpSending(false);
    }
  }, [user?.uid, user?.displayName, managerId]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = assignments.find((a) => a.id === selectedId);

  if (!user) return null;

  return (
    <div className="employee-dash">
      <header className="employee-header">
        <h1>Agenta · My work</h1>
        <div className="employee-header-actions">
          <div className="employee-notif-wrap" ref={notifRef}>
            <button type="button" onClick={() => setShowNotifs((v) => !v)} className="btn-icon" title="Notifications" aria-label="Notifications">
              {React.createElement(FiBell as any)}
              {unreadCount > 0 && <span className="employee-notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </button>
            {showNotifs && (
              <div className="employee-notif-dropdown">
                <div className="employee-notif-dropdown-header">Notifications</div>
                {notifications.length === 0 ? (
                  <p className="employee-notif-empty">No notifications.</p>
                ) : (
                  <ul className="employee-notif-list">
                    {notifications.slice(0, 15).map((n) => (
                      <li key={n.id} className={"employee-notif-item" + (n.read ? "" : " employee-notif-item--unread")} onClick={() => { if (!n.read) markRead(n.id); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" && !n.read) markRead(n.id); }}>
                        <span className="employee-notif-title">{n.title}</span>
                        <span className="employee-notif-body">{n.body}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <span className="user-name">{user.displayName}</span>
          <button type="button" onClick={signOut} className="btn-icon" title="Sign out">
            {React.createElement(FiLogOut as any)}
          </button>
        </div>
      </header>

      {managerId && (
        <section className="section">
          <button
            type="button"
            onClick={handleRequestHelp}
            disabled={helpSending}
            className="btn-primary employee-help-btn"
          >
            {React.createElement(FiHelpCircle as any)} {helpSending ? "Sending…" : helpSent ? "Help request sent" : "Request help from manager"}
          </button>
        </section>
      )}

      <section className="section">
        <h2>{React.createElement(FiBriefcase as any)} Assigned to me</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <ul className="assignment-list">
            {assignments.map((a) => (
              <li
                key={a.id}
                className={`assignment-card ${selectedId === a.id ? "selected" : ""} status-${a.status}`}
                onClick={() => setSelectedId(a.id)}
              >
                <div className="assign-title">{a.title}</div>
                <div className="assign-meta">
                  {a.importance} · {a.timeline} · by {a.assignedByName}
                </div>
              </li>
            ))}
            {assignments.length === 0 && (
              <li className="muted">No assignments yet. Your manager will assign projects via the AI agent.</li>
            )}
          </ul>
        )}
      </section>

      {selected && (
        <section className="section detail-panel">
          <h2>Task details</h2>
          <div className="detail-card">
            <h3>{selected.title}</h3>
            <p className="detail-desc">{selected.description}</p>
            <dl className="detail-meta">
              <dt>Assigned by</dt>
              <dd>{selected.assignedByName}</dd>
              <dt>Importance</dt>
              <dd>{selected.importance}</dd>
              <dt>Timeline</dt>
              <dd>{selected.timeline}</dd>
              <dt>Status</dt>
              <dd>{selected.status}</dd>
            </dl>
          </div>
        </section>
      )}
    </div>
  );
}
