import React, { useState, useEffect, useCallback } from "react";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { EmployeeRequest, EmployeeRequestType } from "../types";
import { FiMessageCircle } from "react-icons/fi";
import "./ManagerDashboard.css";

const REQUEST_TYPE_LABELS: Record<EmployeeRequestType, string> = {
  question: "Question",
  extension: "Extension request",
  emergency: "Emergency",
  other: "Other",
};

export function ManagerRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<EmployeeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseByReq, setResponseByReq] = useState<Record<string, string>>({});
  const [deadlineByReq, setDeadlineByReq] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    if (!user?.uid) return;
    setLoading(true);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      return yield* fs.getEmployeeRequestsByManager(user.uid);
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(setRequests)
      .finally(() => setLoading(false));
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRespond = useCallback(
    (req: EmployeeRequest, status: "accepted" | "rejected") => {
      if (!user?.uid) return;
      setRespondingId(req.id);
      const respMsg = (responseByReq[req.id] ?? "").trim();
      const dlInput = (deadlineByReq[req.id] ?? "").trim();
      const newDeadline = dlInput && req.type === "extension" ? new Date(dlInput + "T12:00:00").getTime() : undefined;
      const program = Effect.gen(function* () {
        const fs = yield* FirestoreService;
        yield* fs.updateEmployeeRequest(req.id, {
          status,
          responseMessage: respMsg || undefined,
          newDeadline,
          respondedAt: Date.now(),
        });
        if (status === "accepted" && req.assignmentId && newDeadline != null) {
          yield* fs.updateAssignment(req.assignmentId, { deadline: newDeadline });
        }
        yield* fs.createNotification({
          userId: req.fromEmployee,
          type: "update",
          title: status === "accepted" ? "Request accepted" : "Request declined",
          body: respMsg || (status === "accepted" ? "Your request was accepted." : "Your request was declined."),
          read: false,
          metadata: { requestId: req.id },
        });
      });
      Effect.runPromise(runWithAppLayer(program))
        .then(() => {
          setResponseByReq((prev) => { const n = { ...prev }; delete n[req.id]; return n; });
          setDeadlineByReq((prev) => { const n = { ...prev }; delete n[req.id]; return n; });
          load();
        })
        .finally(() => setRespondingId(null));
    },
    [user?.uid, responseByReq, deadlineByReq, load]
  );

  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  if (!user) return null;

  return (
    <div className="manager-dash manager-dash--page">
      <h1 className="manager-page-title">
        {React.createElement(FiMessageCircle as any)} Team requests
      </h1>
      <p className="muted" style={{ marginBottom: "1.5rem" }}>
        Accept or reject and add a response.
      </p>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="section">
              <h2 className="manager-calendar-section-title">Pending</h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {pending.map((r) => (
                  <li key={r.id} className="manager-request-card">
                    <h3 className="manager-request-card__title">{REQUEST_TYPE_LABELS[r.type]}</h3>
                    <div className="manager-request-card__meta">From {r.fromEmployeeName}</div>
                    {r.assignmentTitle && <div className="manager-request-card__meta">Task: {r.assignmentTitle}</div>}
                    <div className="manager-request-card__message">{r.message}</div>
                    <div className="manager-request-card__actions">
                      {r.type === "extension" && (
                        <div className="manager-request-card__field">
                          <label className="manager-request-card__label" htmlFor={`deadline-${r.id}`}>New deadline (if accepting)</label>
                          <input id={`deadline-${r.id}`} type="date" className="manager-request-date" value={deadlineByReq[r.id] ?? ""} onChange={(e) => setDeadlineByReq((prev) => ({ ...prev, [r.id]: e.target.value }))} />
                        </div>
                      )}
                      <div className="manager-request-card__field">
                        <label className="manager-request-card__label" htmlFor={`response-${r.id}`}>Response (optional)</label>
                        <textarea id={`response-${r.id}`} className="manager-request-response" rows={3} placeholder="Add a message for the employee" value={responseByReq[r.id] ?? ""} onChange={(e) => setResponseByReq((prev) => ({ ...prev, [r.id]: e.target.value }))} />
                      </div>
                      <div className="manager-request-card__buttons">
                        <button type="button" className="btn-primary" disabled={respondingId === r.id} onClick={() => handleRespond(r, "accepted")}>
                          Accept
                        </button>
                        <button type="button" className="btn-secondary" disabled={respondingId === r.id} onClick={() => handleRespond(r, "rejected")}>
                          Reject
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {resolved.length > 0 && (
            <section className="section">
              <h2 className="manager-calendar-section-title">Resolved</h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {resolved.map((r) => (
                  <li key={r.id} className="manager-request-resolved-card">
                    <div className="manager-request-resolved-card__head">
                      <span className="manager-request-resolved-card__title">{REQUEST_TYPE_LABELS[r.type]} — {r.fromEmployeeName}</span>
                      <span className={`manager-request-resolved-card__status ${r.status === "accepted" ? "manager-request-resolved-card__status--accepted" : "manager-request-resolved-card__status--rejected"}`}>{r.status}</span>
                    </div>
                    <p className="manager-request-resolved-card__message">{r.message}</p>
                    {r.responseMessage && <p className="manager-request-resolved-card__response">Response: {r.responseMessage}</p>}
                    <div className="manager-request-resolved-card__time">{new Date(r.createdAt).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {requests.length === 0 && <p className="muted">No requests from your team yet.</p>}
        </>
      )}
    </div>
  );
}
