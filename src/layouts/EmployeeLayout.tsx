import React, { useState, useEffect, useRef, useCallback } from "react";
import { Outlet, NavLink, Link } from "react-router-dom";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { Notification, ProjectAssignment } from "../types";
import { FiGrid, FiUsers, FiCalendar, FiUser, FiMessageCircle, FiLogOut, FiBell } from "react-icons/fi";
import "./EmployeeLayout.css";

export function EmployeeLayout() {
  const { user, signOut } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [timelineAssignments, setTimelineAssignments] = useState<ProjectAssignment[]>([]);

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

  const loadTimeline = useCallback(() => {
    if (!user?.uid) return;
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const assigned = yield* fs.getAssignmentsAssignedTo(user.uid);
      const active = (assigned ?? []).filter((a: ProjectAssignment) => a.status !== "completed");
      return active;
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(setTimelineAssignments)
      .catch(() => setTimelineAssignments([]));
  }, [user?.uid]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false);
    }
    if (showNotifications) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const handleMarkRead = (id: string) => {
    Effect.runPromise(
      runWithAppLayer(Effect.gen(function* () {
        const fs = yield* FirestoreService;
        yield* fs.markNotificationRead(id);
      }))
    ).catch(() => {});
  };

  return (
    <div className="employee-layout">
      <aside className="employee-layout__left">
        <div className="employee-layout__brand">
          <img src="/assets/logo.png" alt="Agenta" className="employee-layout__logo" />
        </div>
        <nav className="employee-layout__nav">
          <NavLink to="/employee" end className={({ isActive }) => "employee-layout__nav-item" + (isActive ? " employee-layout__nav-item--active" : "")}>
            {React.createElement(FiGrid as any)}
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/employee/team" className={({ isActive }) => "employee-layout__nav-item" + (isActive ? " employee-layout__nav-item--active" : "")}>
            {React.createElement(FiUsers as any)}
            <span>View your team</span>
          </NavLink>
          <NavLink to="/employee/calendar" className={({ isActive }) => "employee-layout__nav-item" + (isActive ? " employee-layout__nav-item--active" : "")}>
            {React.createElement(FiCalendar as any)}
            <span>My calendar</span>
          </NavLink>
          <NavLink to="/employee/profile" className={({ isActive }) => "employee-layout__nav-item" + (isActive ? " employee-layout__nav-item--active" : "")}>
            {React.createElement(FiUser as any)}
            <span>Profile</span>
          </NavLink>
          <NavLink to="/employee/requests" className={({ isActive }) => "employee-layout__nav-item" + (isActive ? " employee-layout__nav-item--active" : "")}>
            {React.createElement(FiMessageCircle as any)}
            <span>Questions &amp; Requests</span>
          </NavLink>
        </nav>
        <div className="employee-layout__left-footer">
          <div className="employee-layout__notif-wrap" ref={notifRef}>
            <button
              type="button"
              className="employee-layout__notif-trigger"
              onClick={() => setShowNotifications((v) => !v)}
              title="Notifications"
              aria-label="Notifications"
            >
              {React.createElement(FiBell as any)}
              <span>Notifications</span>
              {unreadCount > 0 && <span className="employee-layout__notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </button>
            {showNotifications && (
              <div className="employee-layout__notif-dropdown">
                <div className="employee-layout__notif-dropdown-header">Notifications</div>
                {notifications.length === 0 ? (
                  <p className="employee-layout__notif-empty">No notifications yet.</p>
                ) : (
                  <ul className="employee-layout__notif-list">
                    {notifications.slice(0, 20).map((n) => (
                      <li
                        key={n.id}
                        className={"employee-layout__notif-item" + (n.read ? "" : " employee-layout__notif-item--unread")}
                        onClick={() => { if (!n.read) handleMarkRead(n.id); }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" && !n.read) handleMarkRead(n.id); }}
                      >
                        <span className="employee-layout__notif-item-title">{n.title}</span>
                        <span className="employee-layout__notif-item-body">{n.body}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="employee-layout__main">
        <Outlet context={{ reloadTimeline: loadTimeline }} />
      </main>

      <aside className="employee-layout__right">
        <section className="employee-layout__right-section">
          <h3 className="employee-layout__right-title">My project timeline</h3>
          <p className="employee-layout__right-muted">Tasks assigned to you.</p>
          <ul className="employee-layout__assign-list">
            {timelineAssignments.length === 0 ? (
              <li className="employee-layout__assign-empty">No current assignments</li>
            ) : (
              timelineAssignments.slice(0, 15).map((a) => (
                <li key={a.id}>
                  <Link to={`/employee/assignment/${a.id}`} className={"employee-layout__assign-link employee-layout__assign-link--" + (a.importance ?? "medium")}>
                    <span className="employee-layout__assign-dot" aria-hidden />
                    <span className="employee-layout__assign-title">{a.title}</span>
                    {a.deadline != null && (
                      <span className="employee-layout__assign-meta">{new Date(a.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                    )}
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
        <div className="employee-layout__right-footer">
          <span className="employee-layout__user-name">{user?.displayName}</span>
          <button type="button" onClick={() => signOut()} className="employee-layout__sign-out" title="Sign out">
            {React.createElement(FiLogOut as any)}
          </button>
        </div>
      </aside>
    </div>
  );
}
