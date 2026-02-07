/**
 * Fetch events from a public Google Calendar (API key only).
 * For private/primary calendar, OAuth is required.
 * Env: REACT_APP_GOOGLE_CALENDER_KEY (note typo), REACT_APP_GOOGLE_CALENDAR_ID (optional, public calendar ID).
 */

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: string; // ISO date or datetime
  end?: string;
  htmlLink?: string;
}

export interface GoogleCalendarEventsResponse {
  items?: Array<{
    id?: string;
    summary?: string;
    start?: { date?: string; dateTime?: string };
    end?: { date?: string; dateTime?: string };
    htmlLink?: string;
  }>;
}

const API_KEY = process.env.REACT_APP_GOOGLE_CALENDER_KEY || process.env.REACT_APP_GOOGLE_CALENDAR_API_KEY || "";
const CALENDAR_ID = process.env.REACT_APP_GOOGLE_CALENDAR_ID || "";

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(API_KEY && CALENDAR_ID);
}

export async function fetchGoogleCalendarEvents(
  timeMin: Date,
  timeMax: Date
): Promise<GoogleCalendarEvent[]> {
  if (!API_KEY || !CALENDAR_ID) return [];
  const calendarIdEncoded = encodeURIComponent(CALENDAR_ID);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarIdEncoded}/events?key=${encodeURIComponent(API_KEY)}&timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&singleEvents=true&orderBy=startTime`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: GoogleCalendarEventsResponse = await res.json();
    const items = data.items ?? [];
    return items
      .filter((e) => e.id && e.summary && e.start)
      .map((e) => ({
        id: e.id!,
        summary: e.summary!,
        start: e.start!.dateTime || e.start!.date || "",
        end: e.end?.dateTime || e.end?.date,
        htmlLink: e.htmlLink,
      }));
  } catch {
    return [];
  }
}

/**
 * Get start date string (YYYY-MM-DD) for an event for grouping by day.
 */
export function getEventDateKey(ev: GoogleCalendarEvent): string {
  const s = ev.start;
  if (s.includes("T")) return s.slice(0, 10);
  return s;
}
