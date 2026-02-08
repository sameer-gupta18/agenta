import React, { useEffect, useState } from "react";

/** Parses OAuth hash fragment (e.g. #access_token=...&expires_in=3600). */
function parseHash(): { access_token?: string; expires_in?: string; error?: string } {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  return {
    access_token: params.get("access_token") ?? undefined,
    expires_in: params.get("expires_in") ?? undefined,
    error: params.get("error") ?? undefined,
  };
}

/**
 * OAuth callback for Google Calendar. Runs in a popup; sends token (or error) to opener and closes.
 * Route: /calendar-oauth-callback
 */
export function CalendarOAuthCallback() {
  const [status, setStatus] = useState<"success" | "error" | "closing">("closing");

  useEffect(() => {
    const { access_token, expires_in, error } = parseHash();
    const opener = window.opener;

    if (opener && !opener.closed) {
      if (error) {
        setStatus("error");
        opener.postMessage(
          { type: "google-calendar-oauth", error: error || "Access denied" },
          window.location.origin
        );
      } else if (access_token) {
        setStatus("success");
        opener.postMessage(
          { type: "google-calendar-oauth", access_token, expires_in: expires_in ? parseInt(expires_in, 10) : undefined },
          window.location.origin
        );
      }
    } else {
      setStatus("error");
    }

    const t = setTimeout(() => window.close(), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui", textAlign: "center" }}>
      {status === "success" && <p>Connected. This window will close…</p>}
      {status === "error" && <p>Could not connect. You can close this window.</p>}
      {status === "closing" && <p>Closing…</p>}
    </div>
  );
}
