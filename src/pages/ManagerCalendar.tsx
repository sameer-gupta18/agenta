import React, { useState, useEffect, useCallback } from "react";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { ProjectAssignment } from "../types";
import {
  fetchGoogleCalendarEvents,
  isGoogleCalendarConfigured,
  getEventDateKey,
  type GoogleCalendarEvent,
} from "../lib/googleCalendar";
import { FiCalendar, FiClock, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import "./ManagerDashboard.css";
import "./ManagerCalendar.css";

type CalendarEventItem =
  | { type: "deadline"; assignment: ProjectAssignment; dateKey: string }
  | { type: "google"; event: GoogleCalendarEvent; dateKey: string };

function getMonthRange(year: number, month: number): { timeMin: Date; timeMax: Date } {
  const timeMin = new Date(year, month, 1, 0, 0, 0);
  const timeMax = new Date(year, month + 1, 0, 23, 59, 59);
  return { timeMin, timeMax };
}

function dateToKey(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function ManagerCalendar() {
  const { user } = useAuth();
  const [assignmentsByMe, setAssignmentsByMe] = useState<ProjectAssignment[]>([]);
  const [assignedToMe, setAssignedToMe] = useState<ProjectAssignment[]>([]);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date());
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  const loadAssignments = useCallback(() => {
    if (!user?.uid) return;
    setLoading(true);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const byMe = yield* fs.getAssignmentsByManager(user.uid);
      const toMe = yield* fs.getAssignmentsAssignedTo(user.uid);
      return { byMe, toMe };
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(({ byMe, toMe }) => {
        setAssignmentsByMe(byMe ?? []);
        setAssignedToMe(toMe ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.uid]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    if (!isGoogleCalendarConfigured()) return;
    const { timeMin, timeMax } = getMonthRange(viewYear, viewMonth);
    setGoogleLoading(true);
    fetchGoogleCalendarEvents(timeMin, timeMax)
      .then(setGoogleEvents)
      .catch(() => setGoogleEvents([]))
      .finally(() => setGoogleLoading(false));
  }, [viewYear, viewMonth]);

  const withDeadline = (list: ProjectAssignment[]) =>
    list
      .filter((a) => a.deadline != null)
      .sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0));
  const allWithDeadline = [...withDeadline(assignmentsByMe), ...withDeadline(assignedToMe)];
  const uniqAssignments = allWithDeadline.filter(
    (a, i, arr) => arr.findIndex((x) => x.id === a.id) === i
  );

  const eventsByDate = new Map<string, CalendarEventItem[]>();
  uniqAssignments.forEach((a) => {
    if (a.deadline == null) return;
    const d = new Date(a.deadline);
    const dateKey = dateToKey(d);
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
        {React.createElement(FiCalendar as any)} Manager&apos;s calendar
      </h1>
      <p className="muted" style={{ marginBottom: "1.5rem" }}>
        Task deadlines are shown automatically. When you assign a deadline, it appears here and in the list below.
        {isGoogleCalendarConfigured() && " Google Calendar events are loaded when a public calendar ID is set."}
      </p>

      <section className="section manager-calendar-section">
        <div className="manager-calendar-nav">
          <button type="button" onClick={prevMonth} className="manager-calendar-nav-btn" aria-label="Previous month">
            {React.createElement(FiChevronLeft as any)}
          </button>
          <h2 className="manager-calendar-month-title">{monthLabel}</h2>
          <button type="button" onClick={nextMonth} className="manager-calendar-nav-btn" aria-label="Next month">
            {React.createElement(FiChevronRight as any)}
          </button>
        </div>

        <div className="manager-calendar-grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="manager-calendar-weekday">
              {d}
            </div>
          ))}
          {dayCells.map((cell, i) => (
            <div
              key={i}
              className={`manager-calendar-day ${cell.day == null ? "manager-calendar-day--empty" : ""}`}
            >
              {cell.day != null && (
                <>
                  <span className="manager-calendar-day-num">{cell.day}</span>
                  {cell.dateKey && (eventsByDate.get(cell.dateKey) ?? []).length > 0 && (
                    <ul className="manager-calendar-day-events">
                      {(eventsByDate.get(cell.dateKey) ?? []).slice(0, 3).map((item, j) => (
                        <li key={j} className={item.type === "deadline" ? "manager-calendar-day-event manager-calendar-day-event--deadline" : "manager-calendar-day-event manager-calendar-day-event--google"}>
                          {item.type === "deadline" ? (
                            <>Deadline: {item.assignment.title}</>
                          ) : (
                            <>{item.event.summary}</>
                          )}
                        </li>
                      ))}
                      {(eventsByDate.get(cell.dateKey) ?? []).length > 3 && (
                        <li className="manager-calendar-day-event manager-calendar-day-event--more">
                          +{(eventsByDate.get(cell.dateKey) ?? []).length - 3} more
                        </li>
                      )}
                    </ul>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {isGoogleCalendarConfigured() && googleLoading && (
          <p className="muted manager-calendar-google-loading">Loading Google Calendar…</p>
        )}
      </section>

      {!isGoogleCalendarConfigured() && (
        <div className="manager-calendar-google-cta">
          <p className="manager-calendar-google-text">
            <strong>Google Calendar</strong> — Add <code>REACT_APP_GOOGLE_CALENDER_KEY</code> and <code>REACT_APP_GOOGLE_CALENDAR_ID</code> (public calendar ID) to .env to show your Google events here alongside task deadlines.
          </p>
        </div>
      )}

      <section className="section">
        <h2 className="manager-calendar-section-title">
          {React.createElement(FiClock as any)} All deadlines & events
        </h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : uniqAssignments.length === 0 && googleEvents.length === 0 ? (
          <p className="muted">No tasks with deadlines yet. Assign tasks with a deadline on the Assign tasks page to see them here.</p>
        ) : (
          <ul className="manager-calendar-list">
            {uniqAssignments
              .slice()
              .sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0))
              .map((a) => (
                <li key={a.id} className="manager-calendar-item manager-calendar-item--deadline">
                  <div className="manager-calendar-item-title">
                    <span className="manager-calendar-item-badge">Deadline</span> {a.title}
                  </div>
                  <div className="manager-calendar-item-meta">
                    {a.deadline != null && (
                      <span>Due: {new Date(a.deadline).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
                    )}
                    <span>{a.assignedToName}</span>
                    <span className={`manager-calendar-status manager-calendar-status--${a.status}`}>{a.status.replace("_", " ")}</span>
                  </div>
                </li>
              ))}
            {googleEvents
              .slice()
              .sort((a, b) => a.start.localeCompare(b.start))
              .map((ev) => (
                <li key={ev.id} className="manager-calendar-item manager-calendar-item--google">
                  <div className="manager-calendar-item-title">
                    <span className="manager-calendar-item-badge manager-calendar-item-badge--google">Google</span> {ev.summary}
                  </div>
                  <div className="manager-calendar-item-meta">
                    <span>{ev.start.slice(0, 10)}</span>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
