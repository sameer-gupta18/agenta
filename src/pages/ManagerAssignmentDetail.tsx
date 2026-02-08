import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { ProjectAssignment } from "../types";
import { FiArrowLeft, FiMail, FiUser } from "react-icons/fi";
import "./ManagerDashboard.css";

type AssignerContact = { displayName: string; email?: string };

export function ManagerAssignmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [assignment, setAssignment] = useState<ProjectAssignment | null>(null);
  const [assignerContact, setAssignerContact] = useState<AssignerContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !user?.uid) return;
    setLoading(true);
    setError(null);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const a = yield* fs.getAssignment(id);
      if (!a) return { assignment: null, assigner: null };
      const manager = yield* fs.getManager(a.assignedBy);
      if (manager) return { assignment: a, assigner: { displayName: manager.displayName, email: manager.email } };
      const emp = yield* fs.getEmployeeProfile(a.assignedBy);
      const assigner: AssignerContact = emp
        ? { displayName: emp.displayName, email: emp.email }
        : { displayName: a.assignedByName };
      return { assignment: a, assigner };
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(({ assignment: a, assigner }) => {
        setAssignment(a ?? null);
        setAssignerContact(assigner ?? null);
      })
      .catch((e) => setError(e?.message ?? "Failed to load assignment"))
      .finally(() => setLoading(false));
  }, [id, user?.uid]);

  if (!user) return null;
  if (loading) return <div className="manager-dash manager-dash--page"><p className="muted">Loading…</p></div>;
  if (error || !assignment) {
    return (
      <div className="manager-dash manager-dash--page">
        <p className="dash-error">{error ?? "Assignment not found."}</p>
        <Link to="/manager" className="btn-secondary">Back to Dashboard</Link>
      </div>
    );
  }

  const importanceClass = "assign-detail-urgency--" + (assignment.importance ?? "medium");

  return (
    <div className="manager-dash manager-dash--page">
      <div className="assign-detail-header">
        <button type="button" onClick={() => navigate(-1)} className="assign-detail-back">
          {React.createElement(FiArrowLeft as any)} Back
        </button>
      </div>
      <div className={"assign-detail-card " + importanceClass}>
        <h1 className="assign-detail-title">{assignment.title}</h1>
        <p className="assign-detail-desc">{assignment.description}</p>
        <dl className="assign-detail-meta">
          <dt>Status</dt>
          <dd><span className={"assign-detail-status assign-detail-status--" + assignment.status}>{assignment.status}</span></dd>
          <dt>Importance</dt>
          <dd><span className={importanceClass}>{assignment.importance}</span></dd>
          <dt>Timeline</dt>
          <dd>{assignment.timeline}</dd>
          {assignment.deadline != null && (
            <>
              <dt>Deadline</dt>
              <dd>{new Date(assignment.deadline).toLocaleDateString(undefined, { dateStyle: "long" })}</dd>
            </>
          )}
          <dt>Assigned to</dt>
          <dd>{assignment.assignedToName}</dd>
          <dt>Assigned by</dt>
          <dd>{assignment.assignedByName}</dd>
          {assignment.skillsRequired && assignment.skillsRequired.length > 0 && (
            <>
              <dt>Skills required</dt>
              <dd>{assignment.skillsRequired.join(", ")}</dd>
            </>
          )}
        </dl>
      </div>
      <section className="assign-detail-contact-section">
        <h2 className="assign-detail-contact-title">{React.createElement(FiUser as any)} Contact the assigner</h2>
        <p className="muted" style={{ marginBottom: "0.75rem" }}>Contact the assigner if you have questions.</p>
        <div className="assign-detail-contact-card">
          <div className="assign-detail-contact-name">{assignerContact?.displayName ?? assignment.assignedByName}</div>
          {assignerContact?.email && (
            <a href={"mailto:" + assignerContact.email} className="assign-detail-contact-email">
              {React.createElement(FiMail as any)} {assignerContact.email}
            </a>
          )}
          {!assignerContact?.email && (
            <p className="assign-detail-contact-no-email muted">No contact on file for {assignment.assignedByName}.</p>
          )}
        </div>
      </section>
    </div>
  );
}
