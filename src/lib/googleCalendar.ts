/**
 * Google Calendar: OAuth (user's own events) and optional API-key public calendar.
 * - OAuth: set REACT_APP_GOOGLE_CLIENT_ID; user signs in and sees their primary calendar + app deadlines.
 * - Legacy: REACT_APP_GOOGLE_CALENDER_KEY + REACT_APP_GOOGLE_CALENDAR_ID for a single public calendar.
 */

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: string; // ISO date or datetime
  end?: string;
  htmlLink?: string;
  /** Google Calendar colorId (e.g. "1"-"11") for event color. */
  colorId?: string;
}

export interface GoogleCalendarEventsResponse {
  items?: Array<{
    id?: string;
    summary?: string;
    start?: { date?: string; dateTime?: string };
    end?: { date?: string; dateTime?: string };
    htmlLink?: string;
    colorId?: string;
  }>;
}

const API_KEY = process.env.REACT_APP_GOOGLE_CALENDER_KEY || process.env.REACT_APP_GOOGLE_CALENDAR_API_KEY || "";
const CALENDAR_ID = process.env.REACT_APP_GOOGLE_CALENDAR_ID || "";
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";

const CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

/** True if OAuth flow is available (manager can connect their Google account). */
export function isGoogleCalendarOAuthConfigured(): boolean {
  return Boolean(GOOGLE_CLIENT_ID);
}

/** Build Google OAuth URL for calendar read-only. Redirect URI must match Google Cloud Console. */
export function getGoogleCalendarAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "token",
    scope: CALENDAR_READONLY_SCOPE,
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Fetch events from the user's primary calendar using their OAuth access token. */
export async function fetchGoogleCalendarEventsWithToken(
  accessToken: string,
  timeMin: Date,
  timeMax: Date
): Promise<GoogleCalendarEvent[]> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin.toISOString())}&timeMax=${encodeURIComponent(timeMax.toISOString())}&singleEvents=true&orderBy=startTime`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
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
      colorId: e.colorId,
    }));
}

/** Legacy: true if API key + public calendar ID are set. */
export function isGoogleCalendarConfigured(): boolean {
  return Boolean(API_KEY && CALENDAR_ID);
}

/** Legacy: fetch from a single public calendar (API key only). */
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
        colorId: e.colorId,
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

/** Google Calendar default event colors (colorId "1"–"11"). Falls back to a neutral if unknown. */
const GOOGLE_EVENT_COLORS: Record<string, string> = {
  "1": "#7986cb",   // Lavender
  "2": "#33b679",   // Sage
  "3": "#8e24aa",   // Grape
  "4": "#e67c73",   // Flamingo
  "5": "#f6bf26",   // Banana
  "6": "#f4511e",   // Tangerine
  "7": "#039be5",   // Peacock
  "8": "#616161",   // Graphite
  "9": "#3f51b5",   // Blueberry
  "10": "#0b8043",  // Basil
  "11": "#d50000",  // Tomato
};

export function getGoogleEventColor(event: GoogleCalendarEvent): string {
  return event.colorId ? (GOOGLE_EVENT_COLORS[event.colorId] ?? "#616161") : "#616161";
}
