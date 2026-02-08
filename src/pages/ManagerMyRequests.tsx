import React, { useState, useEffect, useCallback } from "react";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { EmployeeRequest, EmployeeRequestType, ProjectAssignment } from "../types";
import { FiMessageCircle, FiSend } from "react-icons/fi";
import "./ManagerDashboard.css";
import "./EmployeeDashboard.css";

const REQUEST_TYPES: { value: EmployeeRequestType; label: string }[] = [
  { value: "question", label: "Question about a project" },
  { value: "extension", label: "Request extension" },
  { value: "emergency", label: "Emergency / urgent" },
  { value: "other", label: "Other" },
];

export function ManagerMyRequests() {
  const { user } = useAuth();
  const [managerId, setManagerId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [requests, setRequests] = useState<EmployeeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [type, setType] = useState<EmployeeRequestType>("question");
  const [assignmentId, setAssignmentId] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    if (!user?.uid) return;
    setLoading(true);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const myRecord = yield* fs.getManager(user.uid);
      const toManager = myRecord?.reportsTo ?? null;
      const assigns = toManager ? yield* fs.getAssignmentsAssignedTo(user.uid) : [];
      const reqs = yield* fs.getEmployeeRequestsByEmployee(user.uid);
      return { managerId: toManager, assignments: assigns ?? [], requests: reqs ?? [] };
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(({ managerId: mid, assignments: a, requests: r }) => {
        setManagerId(mid);
        setAssignments((a ?? []).filter((x) => x.status !== "completed"));
        setRequests(r ?? []);
      })
      .finally(() => setLoading(false));
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!user?.uid || !managerId || !message.trim()) return;
      setSending(true);
      const selectedAssignment = assignmentId ? assignments.find((a) => a.id === assignmentId) : undefined;
      const program = Effect.gen(function* () {
        const fs = yield* FirestoreService;
        const requestId = yield* fs.createEmployeeRequest({
          fromEmployee: user.uid,
          fromEmployeeName: user.displayName ?? "",
          toManager: managerId,
          type,
          assignmentId: assignmentId || undefined,
          assignmentTitle: selectedAssignment?.title,
          message: message.trim(),
          status: "pending",
        });
        yield* fs.createNotification({
          userId: managerId,
          type: "help_request",
          title: "New request from " + (user.displayName ?? "a manager"),
          body: (REQUEST_TYPES.find((t) => t.value === type)?.label ?? type) + (selectedAssignment?.title ? ": " + selectedAssignment.title : ""),
          read: false,
          metadata: { requestId },
        });
        return requestId;
      });
      Effect.runPromise(runWithAppLayer(program))
        .then(() => {
          setMessage("");
          setAssignmentId("");
          load();
        })
        .finally(() => setSending(false));
    },
    [user, managerId, type, assignmentId, message, assignments, load]
  );

  if (!user) return null;

  return (
    <div className="manager-dash manager-dash--page">
      <h1 className="manager-page-title">
        {React.createElement(FiMessageCircle as any)} Questions &amp; Requests
      </h1>
      <p className="muted" style={{ marginBottom: "1.5rem" }}>
        Send a request to your manager.
      </p>

      {!managerId ? (
        <p className="muted">No manager above you.</p>
      ) : (
        <>
          <section className="employee-dash-section">
            <h2 className="employee-dash-section__heading">New request</h2>
            <form onSubmit={handleSubmit} className="employee-request-form">
              <label className="employee-prefs-label">Type of concern</label>
              <select value={type} onChange={(e) => setType(e.target.value as EmployeeRequestType)} className="employee-request-select" aria-label="Type of concern">
                {REQUEST_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {(type === "extension" || type === "emergency") && (
                <>
                  <label className="employee-prefs-label">Related task</label>
                  <select value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)} className="employee-request-select" aria-label="Related task">
                    <option value="">Select a task</option>
                    {assignments.map((a) => (
                      <option key={a.id} value={a.id}>{a.title}</option>
                    ))}
                  </select>
                </>
              )}
              <label className="employee-prefs-label">Message</label>
              <textarea className="employee-prefs-input" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe your question or request..." required />
              <button type="submit" className="btn-primary" disabled={sending || !message.trim()}>
                {React.createElement(FiSend as any)} {sending ? "Sending…" : "Send"}
              </button>
            </form>
          </section>

          <section className="employee-dash-section">
            <h2 className="employee-dash-section__heading">Your requests</h2>
            {loading ? (
              <p className="muted">Loading…</p>
            ) : requests.length === 0 ? (
              <p className="muted">No requests yet.</p>
            ) : (
              <ul className="employee-request-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {requests.map((r) => (
                  <li key={r.id} className="employee-request-card" style={{ marginBottom: "0.75rem", padding: "1rem", background: "var(--agenta-card-bg)", border: "1px solid var(--agenta-border)", borderRadius: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                      <span style={{ fontWeight: 600 }}>{REQUEST_TYPES.find((t) => t.value === r.type)?.label ?? r.type}</span>
                      <span className={`employee-request-status employee-request-status--${r.status}`} style={{ fontSize: "0.85rem", textTransform: "capitalize" }}>{r.status}</span>
                    </div>
                    {r.assignmentTitle && <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>Task: {r.assignmentTitle}</div>}
                    <p style={{ margin: "0.5rem 0 0 0", whiteSpace: "pre-wrap" }}>{r.message}</p>
                    {r.responseMessage && <p className="muted" style={{ marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid var(--agenta-border)" }}><strong>Response:</strong> {r.responseMessage}</p>}
                    <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>{new Date(r.createdAt).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
