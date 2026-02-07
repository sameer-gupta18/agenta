import React, { useState, useEffect, useRef } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { Notification } from "../types";
import {
  FiGrid,
  FiUsers,
  FiCalendar,
  FiSettings,
  FiLogOut,
  FiSend,
  FiSearch,
  FiMenu,
  FiBell,
} from "react-icons/fi";
import "./ManagerLayout.css";

export function ManagerLayout() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

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
          <NavLink to="/manager/settings" className={({ isActive }) => "manager-layout__nav-item" + (isActive ? " manager-layout__nav-item--active" : "")}>
            {React.createElement(FiSettings as any)}
            <span>Settings</span>
          </NavLink>
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
                        onClick={() => { if (!n.read) handleMarkRead(n.id); }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" && !n.read) handleMarkRead(n.id); }}
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
          <p className="manager-layout__right-muted">Tasks and deadlines appear here.</p>
        </section>
        <section className="manager-layout__right-section">
          <h3 className="manager-layout__right-title">Upcoming tasks</h3>
          <p className="manager-layout__right-muted">Your upcoming assignments.</p>
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
