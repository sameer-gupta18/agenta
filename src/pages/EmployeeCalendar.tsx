import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { ProjectAssignment } from "../types";
import {
  fetchGoogleCalendarEventsWithToken,
  getGoogleCalendarAuthUrl,
  isGoogleCalendarOAuthConfigured,
  getEventDateKey,
  type GoogleCalendarEvent,
} from "../lib/googleCalendar";
import { FiCalendar, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import "./ManagerDashboard.css";
import "./ManagerCalendar.css";

type CalendarEventItem =
  | { type: "deadline"; assignment: ProjectAssignment; dateKey: string }
  | { type: "google"; event: GoogleCalendarEvent; dateKey: string };

function dateToKey(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function parseTimelineAsDate(timeline: string): Date | null {
  const s = (timeline || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T12:00:00");
    return isNaN(d.getTime()) ? null : d;
  }
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  const dashMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, day, month, year] = dashMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function getAssignmentDateKey(a: ProjectAssignment): string | null {
  if (a.deadline != null && a.deadline > 0) return dateToKey(new Date(a.deadline));
  const parsed = parseTimelineAsDate(a.timeline);
  return parsed ? dateToKey(parsed) : null;
}

function getAssignmentDateMs(a: ProjectAssignment): number {
  if (a.deadline != null && a.deadline > 0) return a.deadline;
  const parsed = parseTimelineAsDate(a.timeline);
  return parsed ? parsed.getTime() : 0;
}

function firstDayOfMonthKey(year: number, month: number): string {
  return year + "-" + String(month + 1).padStart(2, "0") + "-01";
}

function getMonthRange(year: number, month: number): { timeMin: Date; timeMax: Date } {
  const timeMin = new Date(year, month, 1, 0, 0, 0);
  const timeMax = new Date(year, month + 1, 0, 23, 59, 59);
  return { timeMin, timeMax };
}

export function EmployeeCalendar() {
  const { user } = useAuth();
  const [assignedToMe, setAssignedToMe] = useState<ProjectAssignment[]>([]);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date());
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  const storageKey = user ? `google_calendar_token_${user.uid}` : "";
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() =>
    typeof storageKey === "string" && storageKey ? sessionStorage.getItem(storageKey) : null
  );

  const loadAssignments = useCallback(() => {
    if (!user?.uid) return;
    setLoading(true);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      return yield* fs.getAssignmentsAssignedTo(user.uid);
    });
    Effect.runPromise(runWithAppLayer(program))
      .then((toMe) => setAssignedToMe(toMe ?? []))
      .catch(() => setAssignedToMe([]))
      .finally(() => setLoading(false));
  }, [user?.uid]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "google-calendar-oauth") return;
      if (event.data.error) return;
      const token = event.data.access_token as string | undefined;
      if (token && storageKey) {
        sessionStorage.setItem(storageKey, token);
        setGoogleAccessToken(token);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [storageKey]);

  const connectGoogleCalendar = () => {
    if (!isGoogleCalendarOAuthConfigured() || !storageKey) return;
    const redirectUri = `${window.location.origin}/calendar-oauth-callback`;
    const url = getGoogleCalendarAuthUrl(redirectUri);
    window.open(url, "google-calendar-oauth", "width=500,height=600,scrollbars=yes");
  };

  const disconnectGoogleCalendar = () => {
    if (storageKey) sessionStorage.removeItem(storageKey);
    setGoogleAccessToken(null);
    setGoogleEvents([]);
  };

  useEffect(() => {
    if (!googleAccessToken) {
      setGoogleEvents([]);
      return;
    }
    const { timeMin, timeMax } = getMonthRange(viewYear, viewMonth);
    setGoogleLoading(true);
    fetchGoogleCalendarEventsWithToken(googleAccessToken, timeMin, timeMax)
      .then(setGoogleEvents)
      .catch(() => setGoogleEvents([]))
      .finally(() => setGoogleLoading(false));
  }, [viewYear, viewMonth, googleAccessToken]);

  const activeTasks = assignedToMe.filter((a) => a.status !== "completed");
  const sortedAssignments = [...activeTasks].sort((a, b) => getAssignmentDateMs(a) - getAssignmentDateMs(b));
  const fallbackDateKey = firstDayOfMonthKey(viewYear, viewMonth);

  const eventsByDate = new Map<string, CalendarEventItem[]>();
  sortedAssignments.forEach((a) => {
    const dateKey = getAssignmentDateKey(a) ?? fallbackDateKey;
    const list = eventsByDate.get(dateKey) ?? [];
    list.push({ type: "deadline", assignment: a, dateKey });
    eventsByDate.set(dateKey, list);
  });
  googleEvents.forEach((ev) => {
    const dateKey = getEventDateKey(ev);
    const list = eventsByDate.get(dateKey) ?? [];
    list.push({ type: "google", event: ev, dateKey });
    eventsByDate.set(dateKey, list);
  });

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  const startPad = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
  const dayCells: { day: number | null; dateKey: string | null }[] = [];
  for (let i = 0; i < totalCells; i++) {
    if (i < startPad) {
      dayCells.push({ day: null, dateKey: null });
    } else {
      const day = i - startPad + 1;
      if (day > daysInMonth) {
        dayCells.push({ day: null, dateKey: null });
      } else {
        dayCells.push({
          day,
          dateKey: viewYear + "-" + String(viewMonth + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0"),
        });
      }
    }
  }

  const prevMonth = () => setViewDate(new Date(viewYear, viewMonth - 1));
  const nextMonth = () => setViewDate(new Date(viewYear, viewMonth + 1));
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  if (!user) return null;

  return (
    <div className="manager-dash manager-dash--page">
      <h1 className="manager-page-title">
        {React.createElement(FiCalendar as any)} My calendar
      </h1>
      <p className="muted" style={{ marginBottom: "1rem" }}>
        Your tasks and events.
      </p>

      {isGoogleCalendarOAuthConfigured() && (
        <div className={`manager-calendar-google-connect${googleAccessToken ? " manager-calendar-google-connect--connected" : ""}`} style={{ marginBottom: "1.5rem" }}>
          <div className="manager-calendar-google-connect__content">
            <div className="manager-calendar-google-connect__icon" aria-hidden>{React.createElement(FiCalendar as any, { style: { width: 20, height: 20 } })}</div>
            <p className="manager-calendar-google-connect__text">
              {googleAccessToken ? "Google Calendar connected." : "Connect to show your events on the calendar."}
            </p>
          </div>
          <div className="manager-calendar-google-connect__actions">
            {googleAccessToken ? (
              <button type="button" className="btn-secondary btn-small" onClick={disconnectGoogleCalendar}>Disconnect</button>
            ) : (
              <button type="button" className="btn-primary btn-small" onClick={connectGoogleCalendar} disabled={!user}>
                Connect Google Calendar
              </button>
            )}
          </div>
        </div>
      )}

      {!isGoogleCalendarOAuthConfigured() && (
        <div className="manager-calendar-google-cta" style={{ marginBottom: "1.5rem" }}>
          <p className="manager-calendar-google-text">
            Set <code>REACT_APP_GOOGLE_CLIENT_ID</code> in .env to connect Google Calendar.
          </p>
        </div>
      )}

      {googleAccessToken && googleLoading && (
        <p className="muted manager-calendar-google-loading" style={{ marginBottom: "0.5rem" }}>Loading Google Calendar…</p>
      )}

      <section className="section manager-calendar-section">
        <div className="manager-calendar-nav">
          <button type="button" onClick={prevMonth} className="manager-calendar-nav-btn" aria-label="Previous month">{React.createElement(FiChevronLeft as any)}</button>
          <h2 className="manager-calendar-month-title">{monthLabel}</h2>
          <button type="button" onClick={nextMonth} className="manager-calendar-nav-btn" aria-label="Next month">{React.createElement(FiChevronRight as any)}</button>
        </div>
        <div className="manager-calendar-grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="manager-calendar-weekday">{d}</div>
          ))}
          {dayCells.map((cell, i) => (
            <div key={i} className={`manager-calendar-day ${cell.day == null ? "manager-calendar-day--empty" : ""}`}>
              {cell.day != null && (
                <>
                  <span className="manager-calendar-day-num">{cell.day}</span>
                  {cell.dateKey && (eventsByDate.get(cell.dateKey) ?? []).length > 0 && (
                    <ul className="manager-calendar-day-events">
                      {(eventsByDate.get(cell.dateKey) ?? []).slice(0, 3).map((item, j) => (
                        <li key={j} className={item.type === "deadline" ? "manager-calendar-day-event manager-calendar-day-event--deadline manager-calendar-day-event--deadline-mine" : "manager-calendar-day-event manager-calendar-day-event--google"}>
                          {item.type === "deadline" ? (
                            <Link to={`/employee/assignment/${item.assignment.id}`} style={{ color: "inherit", textDecoration: "none" }}>Deadline: {item.assignment.title}</Link>
                          ) : (
                            <>{item.event.summary}</>
                          )}
                        </li>
                      ))}
                      {(eventsByDate.get(cell.dateKey) ?? []).length > 3 && (
                        <li className="manager-calendar-day-event manager-calendar-day-event--more">+{(eventsByDate.get(cell.dateKey) ?? []).length - 3} more</li>
                      )}
                    </ul>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="manager-calendar-section-title">
          {activeTasks.length > 0 || googleEvents.length > 0
            ? "This month"
            : "Your tasks this month"}
        </h2>
        {(activeTasks.length > 0 || googleEvents.length > 0) ? (
          <div className="manager-calendar-three-cols manager-calendar-two-cols">
            <div className="manager-calendar-col">
              <h3 className="manager-calendar-col-title">Google Calendar events</h3>
              <ul className="manager-calendar-list">
                {googleEvents
                  .slice()
                  .sort((a, b) => new Date(a.start || 0).getTime() - new Date(b.start || 0).getTime())
                  .map((ev) => (
                    <li key={ev.id} className="manager-calendar-item manager-calendar-item--google">
                      <div className="manager-calendar-item-title">{ev.summary}</div>
                      <div className="manager-calendar-item-meta">
                        {ev.start
                          ? ev.start.includes("T")
                            ? new Date(ev.start).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
                            : new Date(ev.start + "T12:00:00").toLocaleDateString(undefined, { dateStyle: "short" })
                          : "—"}
                      </div>
                    </li>
                  ))}
                {googleEvents.length === 0 && (
                  <li className="manager-calendar-list-empty muted">No Google events this month</li>
                )}
              </ul>
            </div>
            <div className="manager-calendar-col">
              <h3 className="manager-calendar-col-title">Your tasks</h3>
              <p className="manager-calendar-col-desc">Tasks assigned to you</p>
              <ul className="manager-calendar-list">
                {sortedAssignments.map((a) => (
                  <li key={a.id} className="manager-calendar-item manager-calendar-item--deadline manager-calendar-item--deadline-mine">
                    <Link to={`/employee/assignment/${a.id}`} className="manager-calendar-item">
                      <div className="manager-calendar-item-title">{a.title}</div>
                      <div className="manager-calendar-item-meta">
                        {getAssignmentDateMs(a) > 0 ? new Date(getAssignmentDateMs(a)).toLocaleDateString(undefined, { dateStyle: "medium" }) : a.timeline}
                      </div>
                    </Link>
                  </li>
                ))}
                {sortedAssignments.length === 0 && (
                  <li className="manager-calendar-list-empty muted">No tasks this month</li>
                )}
              </ul>
            </div>
          </div>
        ) : loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <p className="muted">
            No tasks with dates.
            {isGoogleCalendarOAuthConfigured() && !googleAccessToken && " Connect Google Calendar above."}
          </p>
        )}
      </section>
    </div>
  );
}
