import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import { expandTaskDescriptionForEmployee, getProjectAidFromGroq } from "../lib/groq";
import type { ProjectAssignment } from "../types";
import { FiArrowLeft, FiFileText, FiZap } from "react-icons/fi";
import "./EmployeeDashboard.css";

export function EmployeeAssignmentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [assignment, setAssignment] = useState<ProjectAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [descriptionText, setDescriptionText] = useState<string>("");
  const [descriptionLoading, setDescriptionLoading] = useState(false);
  const [descriptionFromAi, setDescriptionFromAi] = useState(false);
  const [projectAid, setProjectAid] = useState<string | null>(null);
  const [projectAidLoading, setProjectAidLoading] = useState(false);

  useEffect(() => {
    if (!id || !user?.uid) return;
    setLoading(true);
    setError(null);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      const a = yield* fs.getAssignment(id);
      return a;
    });
    Effect.runPromise(runWithAppLayer(program))
      .then((a) => {
        if (a && a.assignedTo === user.uid) setAssignment(a);
        else setError("Task not found or not assigned to you.");
      })
      .catch(() => setError("Failed to load task."))
      .finally(() => setLoading(false));
  }, [id, user?.uid]);

  useEffect(() => {
    if (!assignment) return;
    const raw = (assignment.description || "").trim();
    if (raw.length > 20) {
      setDescriptionText(raw);
      setDescriptionFromAi(false);
      return;
    }
    setDescriptionLoading(true);
    expandTaskDescriptionForEmployee(assignment.title, raw || undefined)
      .then((ai) => {
        if (ai) {
          setDescriptionText(ai);
          setDescriptionFromAi(true);
        } else {
          setDescriptionText(raw || "No description provided.");
          setDescriptionFromAi(false);
        }
      })
      .catch(() => {
        setDescriptionText(raw || "No description provided.");
        setDescriptionFromAi(false);
      })
      .finally(() => setDescriptionLoading(false));
  }, [assignment?.id, assignment?.title, assignment?.description]);

  useEffect(() => {
    if (!assignment) return;
    setProjectAid(null);
    setProjectAidLoading(true);
    const desc = (assignment.description || "").trim();
    getProjectAidFromGroq(assignment.title, desc || undefined)
      .then((aid) => setProjectAid(aid))
      .catch(() => setProjectAid(null))
      .finally(() => setProjectAidLoading(false));
  }, [assignment?.id, assignment?.title, assignment?.description]);

  if (!user) return null;

  if (loading) return <div className="employee-dash-page"><p className="muted">Loading…</p></div>;
  if (error || !assignment) {
    return (
      <div className="employee-dash-page">
        <p className="muted">{error ?? "Task not found."}</p>
        <Link to="/employee" className="employee-back-link">
          {React.createElement(FiArrowLeft as any)} Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="employee-dash-page">
      <Link to="/employee" className="employee-back-link employee-back-link--block">
        {React.createElement(FiArrowLeft as any)} Back to dashboard
      </Link>
      <div className="employee-assignment-detail">
        <h1 className="employee-assignment-detail__title">{assignment.title}</h1>
        <div className="employee-assignment-detail__description-block">
          <h2 className="employee-assignment-detail__description-heading">
            {React.createElement(FiFileText as any)} Description
            {descriptionFromAi && <span className="employee-assignment-detail__ai-badge">Summary</span>}
          </h2>
          {descriptionLoading ? (
            <p className="employee-assignment-detail__description-loading">Loading…</p>
          ) : (
            <div className="employee-assignment-detail__description-text">{descriptionText}</div>
          )}
        </div>
        <div className="employee-assignment-detail__aid-block">
          <h2 className="employee-assignment-detail__aid-heading">
            {React.createElement(FiZap as any)} Guidance for this project
          </h2>
          {projectAidLoading ? (
            <p className="employee-assignment-detail__description-loading">Loading…</p>
          ) : projectAid ? (
            <div className="employee-assignment-detail__aid-text">{projectAid}</div>
          ) : (
            <p className="employee-assignment-detail__aid-empty">No guidance for this task.</p>
          )}
        </div>
        <dl className="detail-meta employee-assignment-detail__meta">
          <dt>Assigned by</dt>
          <dd>{assignment.assignedByName}</dd>
          <dt>Importance</dt>
          <dd>{assignment.importance}</dd>
          <dt>Timeline</dt>
          <dd>{assignment.timeline}</dd>
          {assignment.deadline != null && (
            <>
              <dt>Due date</dt>
              <dd>{new Date(assignment.deadline).toLocaleDateString(undefined, { dateStyle: "medium" })}</dd>
            </>
          )}
          <dt>Status</dt>
          <dd>{assignment.status.replace("_", " ")}</dd>
        </dl>
      </div>
    </div>
  );
}
