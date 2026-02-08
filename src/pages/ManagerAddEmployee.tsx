import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  EducationPicker,
  educationEntriesToStrings,
  stringsToEducationEntries,
  type EducationEntry,
} from "../components/EducationPicker";
import { TagInput } from "../components/TagInput";
import { readCVFile } from "../lib/cvReader";
import { FiUserPlus, FiUploadCloud } from "react-icons/fi";
import "./ManagerDashboard.css";

/** Extract a user-friendly message from createEmployee callable errors. Never show raw "server error". */
function getCreateEmployeeErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return "Failed to create employee. Please try again.";
  const o = err as { message?: string; code?: string; details?: { message?: string } };
  const code = typeof o.code === "string" ? o.code : "";
  const msg = typeof o.message === "string" ? o.message.trim() : "";
  const detailsMsg = o.details && typeof o.details === "object" && typeof (o.details as { message?: string }).message === "string"
    ? (o.details as { message: string }).message.trim()
    : "";
  const displayMsg = detailsMsg || (msg && !msg.toLowerCase().includes("internal") ? msg : "");

  if (code === "functions/already-exists" || code === "already-exists")
    return "An account with this email already exists.";
  if (code === "functions/permission-denied" || code === "permission-denied")
    return "You don’t have permission to create employees.";
  if (code === "functions/unauthenticated" || code === "unauthenticated")
    return "You must be signed in to add an employee.";
  if (code === "functions/failed-precondition" || code === "failed-precondition")
    return displayMsg || "Email/password sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.";
  if (code === "functions/invalid-argument" || code === "invalid-argument")
    return displayMsg || "Invalid email or password. Use at least 6 characters for password.";
  if (code === "functions/internal" || code === "internal" || code === "functions/unknown")
    return "Could not create account. The email may already be in use, or the server is temporarily unavailable. Please try again.";
  if (displayMsg) return displayMsg;
  return "Failed to create employee. Please try again.";
}

const emptyProfile = {
  position: "",
  department: "",
  phone: "",
  bio: "",
  educationEntries: [] as EducationEntry[],
  qualifications: [] as string[],
  skills: [] as string[],
  experience: "",
  workEx: "",
  resume: "",
};

export function ManagerAddEmployee() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [newEmployee, setNewEmployee] = useState({
    email: "",
    password: "",
    displayName: "",
    ...emptyProfile,
  });
  const [cvLoading, setCvLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvLoading(true);
    setError(null);
    try {
      const parsed = await readCVFile(file);
      setNewEmployee((prev) => ({
        ...prev,
        position: parsed.position ?? prev.position,
        department: parsed.department ?? prev.department,
        phone: parsed.phone ?? prev.phone,
        educationEntries: (parsed.education?.length ? stringsToEducationEntries(parsed.education) : prev.educationEntries),
        qualifications: (parsed.qualifications?.length ? parsed.qualifications : prev.qualifications),
        experience: parsed.experience ?? prev.experience,
        workEx: parsed.workEx ?? prev.workEx,
        skills: parsed.skills?.length ? parsed.skills.slice(0, 6) : prev.skills,
        resume: parsed.resume ?? prev.resume,
        bio: parsed.bio ?? prev.bio,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read CV");
    } finally {
      setCvLoading(false);
      e.target.value = "";
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    const email = newEmployee.email.trim();
    const password = newEmployee.password;
    if (!email) {
      setError("Email is required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { getFunctions, httpsCallable } = await import("firebase/functions");
      const { getFirebaseApp } = await import("../config/firebase");
      const fn = getFunctions(getFirebaseApp());
      const educationStrings = educationEntriesToStrings(newEmployee.educationEntries);
      const profile: Record<string, unknown> = {};
      if (newEmployee.position.trim()) profile.position = newEmployee.position.trim();
      if (newEmployee.department.trim()) profile.department = newEmployee.department.trim();
      if (newEmployee.phone.trim()) profile.phone = newEmployee.phone.trim();
      if (newEmployee.bio.trim()) profile.bio = newEmployee.bio.trim();
      if (educationStrings.length) profile.education = educationStrings;
      if (newEmployee.qualifications.length) profile.qualifications = newEmployee.qualifications;
      if (newEmployee.skills.length) profile.skills = newEmployee.skills.slice(0, 6);
      if (newEmployee.experience.trim()) profile.experience = newEmployee.experience.trim();
      if (newEmployee.workEx.trim()) profile.workEx = newEmployee.workEx.trim();
      if (newEmployee.resume.trim()) profile.resume = newEmployee.resume.trim();

      const createEmployee = httpsCallable<
        { email: string; password: string; displayName: string; profile?: Record<string, unknown> },
        { uid: string }
      >(fn, "createEmployee");
      await createEmployee({
        email,
        password,
        displayName: newEmployee.displayName.trim() || email.split("@")[0],
        profile: Object.keys(profile).length > 0 ? profile : undefined,
      });
      navigate("/manager");
    } catch (err: unknown) {
      setError(getCreateEmployeeErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="manager-dash manager-dash--page">
      <h1 className="manager-page-title">
        {React.createElement(FiUserPlus as any)} Add employee
      </h1>
      <p className="muted" style={{ marginBottom: "1.5rem" }}>
        Add an employee. Set email and password; they sign in with those.
      </p>

      {error && (
        <div className="dash-error" style={{ marginBottom: "1rem" }}>
          {error}
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <section className="section section--add-employee">
        <form onSubmit={handleCreateEmployee} className="project-form employee-form add-employee-form">
          <div className="form-section">
            <h3 className="form-section-title">Account</h3>
            <label>
              Display name
              <input
                value={newEmployee.displayName}
                onChange={(e) => setNewEmployee({ ...newEmployee, displayName: e.target.value })}
                placeholder="Employee name"
                aria-label="Display name"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={newEmployee.email}
                onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                placeholder="employee@company.com"
                required
                aria-label="Email"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={newEmployee.password}
                onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
                placeholder="Min 6 characters"
                required
                minLength={6}
                aria-label="Password"
              />
            </label>
          </div>
          <div className="form-section">
            <h3 className="form-section-title">CV (optional)</h3>
            <label className="file-label">
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={handleCVUpload}
                disabled={cvLoading}
                className="file-input"
                aria-label="Upload CV"
              />
              <span className="file-button">
                {React.createElement(FiUploadCloud as any)} {cvLoading ? "Reading…" : "Upload PDF or TXT to auto-fill below"}
              </span>
            </label>
          </div>
          <div className="form-section">
            <h3 className="form-section-title">Basic info</h3>
            <label>
              Position
              <input
                value={newEmployee.position}
                onChange={(e) => setNewEmployee({ ...newEmployee, position: e.target.value })}
                placeholder="e.g. Software Engineer"
                aria-label="Position"
              />
            </label>
            <label>
              Department
              <input
                value={newEmployee.department}
                onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })}
                placeholder="e.g. Engineering"
                aria-label="Department"
              />
            </label>
            <label>
              Phone
              <input
                type="tel"
                value={newEmployee.phone}
                onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })}
                placeholder="+1 234 567 8900"
                aria-label="Phone"
              />
            </label>
            <label>
              Bio
              <textarea
                value={newEmployee.bio}
                onChange={(e) => setNewEmployee({ ...newEmployee, bio: e.target.value })}
                placeholder="Short bio"
                rows={2}
                aria-label="Bio"
              />
            </label>
          </div>
          <div className="form-section">
            <h3 className="form-section-title">Education</h3>
            <label>
              <EducationPicker
                value={newEmployee.educationEntries}
                onChange={(educationEntries) => setNewEmployee({ ...newEmployee, educationEntries })}
                aria-label="Education"
              />
            </label>
          </div>
          <div className="form-section">
            <h3 className="form-section-title">Qualifications / certifications</h3>
            <label>
              <TagInput
                value={newEmployee.qualifications}
                onChange={(qualifications) => setNewEmployee({ ...newEmployee, qualifications })}
                placeholder="Type a qualification and press Enter"
                aria-label="Qualifications"
              />
            </label>
          </div>
          <div className="form-section">
            <h3 className="form-section-title">Experience</h3>
            <label>
              Experience summary
              <textarea
                value={newEmployee.experience}
                onChange={(e) => setNewEmployee({ ...newEmployee, experience: e.target.value })}
                placeholder="Brief experience description"
                rows={2}
                aria-label="Experience summary"
              />
            </label>
            <label>
              Work experience (detailed)
              <textarea
                value={newEmployee.workEx}
                onChange={(e) => setNewEmployee({ ...newEmployee, workEx: e.target.value })}
                placeholder="Roles, companies, dates"
                rows={4}
                aria-label="Work experience"
              />
            </label>
          </div>
          <div className="form-section">
            <h3 className="form-section-title">Skills</h3>
            <label>
              <TagInput
                value={newEmployee.skills}
                onChange={(skills) => setNewEmployee({ ...newEmployee, skills: skills.slice(0, 6) })}
                placeholder="Type a skill and press Enter (max 6)"
                aria-label="Skills"
                maxTags={6}
              />
            </label>
          </div>
          <div className="form-section">
            <h3 className="form-section-title">Resume / full text</h3>
            <label>
              <textarea
                value={newEmployee.resume}
                onChange={(e) => setNewEmployee({ ...newEmployee, resume: e.target.value })}
                placeholder="Paste or from CV upload"
                rows={4}
                aria-label="Resume"
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Creating…" : "Create employee"}
            </button>
            <button type="button" onClick={() => navigate("/manager")} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
