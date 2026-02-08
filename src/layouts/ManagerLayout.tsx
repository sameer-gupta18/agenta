import React, { useState, useEffect, useRef, useCallback } from "react";
import { Outlet, NavLink, Link, useNavigate } from "react-router-dom";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { Notification, ProjectAssignment } from "../types";
import {
  FiGrid,
  FiUsers,
  FiCalendar,
  FiCheckCircle,
  FiSettings,
  FiLogOut,
  FiSend,
  FiSearch,
  FiMenu,
  FiBell,
  FiMessageCircle,
  FiUser,
} from "react-icons/fi";
import "./ManagerLayout.css";

export function ManagerLayout() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [myTimelineAssignments, setMyTimelineAssignments] = useState<ProjectAssignment[]>([]);
  const [upcomingAssignments, setUpcomingAssignments] = useState<ProjectAssignment[]>([]);
  const [hasManager, setHasManager] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const me = yield* fs.getManager(user.uid);
      return Boolean(me?.reportsTo);
    });
    Effect.runPromise(runWithAppLayer(program)).then(setHasManager).catch(() => setHasManager(false));
  }, [user?.uid]);

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

  const loadSidebarAssignments = useCallback(() => {
    if (!user?.uid) return;
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const assignedToMe = yield* fs.getAssignmentsAssignedTo(user.uid);
      const assignedByMe = yield* fs.getAssignmentsByManager(user.uid);
      /* Exclude completed; they appear only on Completed tasks page */
      const myCurrent = (assignedToMe ?? []).filter((a: ProjectAssignment) => a.status !== "completed");
      const upcoming = (assignedByMe ?? []).filter((a: ProjectAssignment) => a.status !== "completed");
      return { myCurrent, upcoming };
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(({ myCurrent, upcoming }) => {
        setMyTimelineAssignments(myCurrent);
        setUpcomingAssignments(upcoming);
      })
      .catch(() => {});
  }, [user?.uid]);

  useEffect(() => {
    loadSidebarAssignments();
  }, [loadSidebarAssignments]);

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
    <div className="manager-layout">
      <aside className="manager-layout__left">
        <div className="manager-layout__brand">
          <img src="/assets/logo.png" alt="Agenta" className="manager-layout__logo" />
        </div>
        <nav className="manager-layout__nav">
          <NavLink to="/manager" end className={({ isActive }) => "manager-layout__nav-item" + (isActive ? " manager-layout__nav-item--active" : "")}>
            {React.createElement(FiGrid as any)}
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/manager/team" className={({ isActive }) => "manager-layout__nav-item" + (isActive ? " manager-layout__nav-item--active" : "")}>
            {React.createElement(FiUsers as any)}
            <span>View your team</span>
          </NavLink>
          <NavLink to="/manager/calendar" className={({ isActive }) => "manager-layout__nav-item" + (isActive ? " manager-layout__nav-item--active" : "")}>
            {React.createElement(FiCalendar as any)}
            <span>Manager&apos;s calendar</span>
          </NavLink>
          <NavLink to="/manager/completed" className={({ isActive }) => "manager-layout__nav-item" + (isActive ? " manager-layout__nav-item--active" : "")}>
            {React.createElement(FiCheckCircle as any)}
            <span>Completed tasks</span>
          </NavLink>
          <NavLink to="/manager/requests" className={({ isActive }) => "manager-layout__nav-item" + (isActive ? " manager-layout__nav-item--active" : "")}>
            {React.createElement(FiMessageCircle as any)}
            <span>Team requests</span>
          </NavLink>
          {hasManager && (
            <>
              <NavLink to="/manager/settings" className={({ isActive }) => "manager-layout__nav-item" + (isActive ? " manager-layout__nav-item--active" : "")}>
                {React.createElement(FiUser as any)}
                <span>Profile</span>
              </NavLink>
              <NavLink to="/manager/my-requests" className={({ isActive }) => "manager-layout__nav-item" + (isActive ? " manager-layout__nav-item--active" : "")}>
                {React.createElement(FiMessageCircle as any)}
                <span>Questions &amp; Requests</span>
              </NavLink>
            </>
          )}
          {!hasManager && (
            <NavLink to="/manager/settings" className={({ isActive }) => "manager-layout__nav-item" + (isActive ? " manager-layout__nav-item--active" : "")}>
              {React.createElement(FiSettings as any)}
              <span>Settings</span>
            </NavLink>
          )}
          <NavLink
            to="/manager/assign"
            className={({ isActive }) => "manager-layout__nav-item manager-layout__nav-item--assign" + (isActive ? " manager-layout__nav-item--active" : "")}
          >
            {React.createElement(FiSend as any)}
            <span>Assign tasks</span>
          </NavLink>
        </nav>
        <div className="manager-layout__left-footer">
          <div className="manager-layout__notif-wrap manager-layout__notif-wrap--left" ref={notifRef}>
            <button
              type="button"
              className="manager-layout__notif-trigger"
              onClick={() => setShowNotifications((v) => !v)}
              title="Notifications"
              aria-label="Notifications"
            >
              {React.createElement(FiBell as any)}
              <span>Notifications</span>
              {unreadCount > 0 && <span className="manager-layout__notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </button>
            {showNotifications && (
              <div className="manager-layout__notif-dropdown manager-layout__notif-dropdown--from-left">
                <div className="manager-layout__notif-dropdown-header">Notifications</div>
                {notifications.length === 0 ? (
                  <p className="manager-layout__notif-empty">No notifications yet.</p>
                ) : (
                  <ul className="manager-layout__notif-list">
                    {notifications.slice(0, 20).map((n) => (
                      <li
                        key={n.id}
                        className={"manager-layout__notif-item" + (n.read ? "" : " manager-layout__notif-item--unread")}
                        onClick={() => {
                          if (n.metadata?.requestId) {
                            setShowNotifications(false);
                            navigate("/manager/requests");
                          }
                          if (!n.read) handleMarkRead(n.id);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (n.metadata?.requestId) {
                              setShowNotifications(false);
                              navigate("/manager/requests");
                            }
                            if (!n.read) handleMarkRead(n.id);
                          }
                        }}
                      >
                        <span className="manager-layout__notif-item-title">{n.title}</span>
                        <span className="manager-layout__notif-item-body">{n.body}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="manager-layout__theme">
            <span className="manager-layout__theme-label">Dark / Light</span>
            <button type="button" onClick={toggleTheme} className="manager-layout__theme-toggle" aria-label="Toggle theme">
              <span className={"manager-layout__theme-dot" + (theme === "light" ? " manager-layout__theme-dot--right" : "")} />
            </button>
          </div>
        </div>
      </aside>

      <main className="manager-layout__main">
        <Outlet />
      </main>

      <aside className="manager-layout__right">
        <div className="manager-layout__right-header">
          <div className="manager-layout__search-wrap">
            {React.createElement(FiSearch as any)}
            <input type="search" placeholder="Search" className="manager-layout__search" aria-label="Search" />
          </div>
          <button type="button" className="manager-layout__icon-btn" title="Profile" aria-label="Profile">
            <span className="manager-layout__avatar-small">{user?.displayName?.charAt(0) ?? "?"}</span>
          </button>
          <button type="button" className="manager-layout__icon-btn" title="Menu" aria-label="Menu">
            {React.createElement(FiMenu as any)}
          </button>
        </div>
        <section className="manager-layout__right-section">
          <h3 className="manager-layout__right-title">My project timeline</h3>
          <p className="manager-layout__right-muted">Assignments assigned to you.</p>
          <ul className="manager-layout__assign-list">
            {myTimelineAssignments.length === 0 ? (
              <li className="manager-layout__assign-empty">No current assignments</li>
            ) : (
              myTimelineAssignments.slice(0, 15).map((a) => (
                <li key={a.id}>
                  <Link to={`/manager/assignment/${a.id}`} className={"manager-layout__assign-link manager-layout__assign-link--" + (a.importance ?? "medium")}>
                    <span className="manager-layout__assign-dot" aria-hidden />
                    <span className="manager-layout__assign-title">{a.title}</span>
                    {a.deadline != null && (
                      <span className="manager-layout__assign-meta">{new Date(a.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                    )}
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
        <section className="manager-layout__right-section">
          <h3 className="manager-layout__right-title">Upcoming tasks</h3>
          <p className="manager-layout__right-muted">Projects you assigned to your team.</p>
          <ul className="manager-layout__assign-list">
            {upcomingAssignments.length === 0 ? (
              <li className="manager-layout__assign-empty">No upcoming assignments</li>
            ) : (
              upcomingAssignments.slice(0, 15).map((a) => (
                <li key={a.id}>
                  <Link to={`/manager/assignment/${a.id}`} className={"manager-layout__assign-link manager-layout__assign-link--" + (a.importance ?? "medium")}>
                    <span className="manager-layout__assign-dot" aria-hidden />
                    <span className="manager-layout__assign-title">{a.title}</span>
                    <span className="manager-layout__assign-meta">{a.assignedToName}</span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
        <div className="manager-layout__right-footer">
          <span className="manager-layout__user-name">{user?.displayName}</span>
          <button type="button" onClick={() => signOut()} className="manager-layout__sign-out" title="Sign out">
            {React.createElement(FiLogOut as any)}
          </button>
        </div>
      </aside>
    </div>
  );
}
