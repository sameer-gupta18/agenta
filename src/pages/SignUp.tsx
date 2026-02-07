import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Effect } from "effect";
import { FirebaseAuthService, FirestoreService, runWithAppLayer } from "../lib/effect";
import { FiUserPlus, FiUploadCloud } from "react-icons/fi";
import { readCVFile } from "../lib/cvReader";
import type { ManagerInvite } from "../types";
import {
  EducationPicker,
  educationEntriesToStrings,
  stringsToEducationEntries,
  type EducationEntry,
} from "../components/EducationPicker";
import { TagInput } from "../components/TagInput";
import "./Login.css";

/**
 * Sign-up is only for managers with a valid admin-created invite link.
 * Employees cannot sign up; managers create their accounts from the manager dashboard.
 */
function SignUpForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const managerInviteToken = searchParams.get("managerInvite") ?? "";
  const isManagerSignup = searchParams.get("role") === "manager";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [educationEntries, setEducationEntries] = useState<EducationEntry[]>([]);
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [cvLoading, setCvLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managerInviteValid, setManagerInviteValid] = useState<boolean | null>(
    isManagerSignup && managerInviteToken ? null : false
  );
  const [managerInvite, setManagerInvite] = useState<ManagerInvite | null>(null);

  useEffect(() => {
    if (!isManagerSignup || !managerInviteToken) {
      setManagerInviteValid(false);
      setManagerInvite(null);
      return;
    }
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      return yield* fs.getManagerInvite(managerInviteToken);
    });
    Effect.runPromise(runWithAppLayer(program))
      .then((inv) => {
        if (!inv) {
          setManagerInviteValid(false);
          setManagerInvite(null);
        } else if (inv.used) {
          setManagerInviteValid(false);
          setManagerInvite(null);
        } else if (Date.now() > inv.expiresAt) {
          setManagerInviteValid(false);
          setManagerInvite(null);
        } else {
          setManagerInviteValid(true);
          setManagerInvite(inv);
        }
      })
      .catch(() => {
        setManagerInviteValid(false);
        setManagerInvite(null);
      });
  }, [isManagerSignup, managerInviteToken]);

  const handleCVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvLoading(true);
    setError(null);
    try {
      const parsed = await readCVFile(file);
      if (parsed.position && !managerInvite?.position) setPosition(parsed.position);
      if (parsed.department && !managerInvite?.department) setDepartment(parsed.department);
      if (parsed.phone) setPhone(parsed.phone);
      if (parsed.gender) setGender(parsed.gender);
      if (parsed.dateOfBirth) setDateOfBirth(parsed.dateOfBirth);
      if (parsed.age != null) setAge(String(parsed.age));
      if (parsed.education?.length) setEducationEntries(stringsToEducationEntries(parsed.education));
      if (parsed.qualifications?.length) setQualifications(parsed.qualifications);
      const bioValue = parsed.bio || parsed.resume || parsed.experience;
      if (bioValue) setBio(bioValue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read CV");
    } finally {
      setCvLoading(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managerInviteValid) return;
    setError(null);
    setSubmitting(true);
    const authProgram = Effect.gen(function* () {
      const auth = yield* FirebaseAuthService;
      return yield* auth.signUp(email, password, displayName);
    });
    const withLayer = runWithAppLayer(authProgram);
    try {
      const result = (await Effect.runPromise(withLayer)) as {
        uid: string;
        email: string;
        displayName: string;
      };
      const { uid, email: em, displayName: name } = result;
      const reportsTo = managerInvite?.reportsTo ?? undefined;
      const fsProgram = Effect.gen(function* () {
        const fs = yield* FirestoreService;
        yield* fs.setUserRole(uid, "manager", name, em);
        yield* fs.setManagerRecord(uid, {
          email: em,
          displayName: name,
          ...(reportsTo && { reportsTo }),
        });
        if (managerInviteToken) yield* fs.markManagerInviteUsed(managerInviteToken);
        const educationStrings = educationEntriesToStrings(educationEntries);
        const ageNum = age.trim() ? parseInt(age.trim(), 10) : undefined;
        const effectivePosition = (managerInvite?.position ?? position.trim()) || undefined;
        const effectiveDepartment = (managerInvite?.department ?? department.trim()) || undefined;
        const hasProfile =
          effectivePosition || effectiveDepartment || phone || bio || gender || dateOfBirth || (ageNum != null && !Number.isNaN(ageNum)) ||
          educationStrings.length || qualifications.length;
        if (hasProfile) {
          yield* fs.updateManagerRecord(uid, {
            position: effectivePosition,
            department: effectiveDepartment,
            phone: phone.trim() || undefined,
            gender: gender.trim() || undefined,
            dateOfBirth: dateOfBirth.trim() || undefined,
            age: ageNum != null && !Number.isNaN(ageNum) ? ageNum : undefined,
            bio: bio.trim() || undefined,
            education: educationStrings.length ? educationStrings : undefined,
            qualifications: qualifications.length ? qualifications : undefined,
          });
        }
      });
      await Effect.runPromise(runWithAppLayer(fsProgram));
      navigate("/", { replace: true });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  };

  const showForm = isManagerSignup && managerInviteToken && managerInviteValid === true;

  if (!showForm) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <img src="/assets/logo.png" alt="Agenta" className="login-header__logo" />
            <p>Account creation</p>
          </div>
          <div className="login-form">
            <p className="muted" style={{ marginBottom: "1rem", textAlign: "center" }}>
              You cannot create an account here. Manager accounts are created by an administrator (use the invite link they provide). Employee accounts are created by your manager—they set your email and password.
            </p>
            <p className="login-footer" style={{ marginTop: "1rem" }}>
              <a href="/login">Sign in</a> if you already have credentials.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/assets/logo.png" alt="Agenta" className="login-header__logo" />
          <p>Create your manager account (invite required)</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              required
              autoComplete="name"
            />
          </label>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
          </label>
          {managerInvite && (
            <>
              <div className="login-form-readonly" aria-live="polite">
                <span className="login-form-readonly-label">Reports to</span>
                <span className="login-form-readonly-value">
                  {managerInvite.reportsTo
                    ? (managerInvite.reportsToDisplayName || "Reporting manager")
                    : "Independent team"}
                </span>
              </div>
              {managerInvite.position != null && managerInvite.position !== "" && (
                <div className="login-form-readonly" aria-live="polite">
                  <span className="login-form-readonly-label">Position</span>
                  <span className="login-form-readonly-value">{managerInvite.position}</span>
                </div>
              )}
              {managerInvite.department != null && managerInvite.department !== "" && (
                <div className="login-form-readonly" aria-live="polite">
                  <span className="login-form-readonly-label">Department</span>
                  <span className="login-form-readonly-value">{managerInvite.department}</span>
                </div>
              )}
            </>
          )}
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              minLength={6}
            />
          </label>
          <div className="login-form-section">
            <span className="login-form-section-title">Profile (optional)</span>
            <label className="file-label">
              <input type="file" accept=".pdf,.txt" onChange={handleCVUpload} disabled={cvLoading} className="file-input" />
              <span className="file-button">
                {React.createElement(FiUploadCloud as any)} {cvLoading ? "Reading…" : "Upload CV to auto-fill"}
              </span>
            </label>
            {!(managerInvite?.position != null && managerInvite.position !== "") && (
              <label>
                <span>Position</span>
                <input type="text" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Engineering Manager" />
              </label>
            )}
            {!(managerInvite?.department != null && managerInvite.department !== "") && (
              <label>
                <span>Department</span>
                <input type="text" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Engineering" />
              </label>
            )}
            <label>
              <span>Phone</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 234 567 8900" />
            </label>
            <label>
              <span>Gender</span>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="login-form__select"
                aria-label="Gender"
              >
                <option value="">Select gender</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </label>
            <label>
              <span>Date of birth</span>
              <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} placeholder="YYYY-MM-DD" />
            </label>
            <label>
              <span>Age</span>
              <input type="number" min={16} max={120} value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 32" />
            </label>
            <label>
              <span>Bio</span>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short bio" rows={2} />
            </label>
            <label>
              <span>Education</span>
              <EducationPicker value={educationEntries} onChange={setEducationEntries} aria-label="Education" />
            </label>
            <label>
              <span>Qualifications / certifications</span>
              <TagInput value={qualifications} onChange={setQualifications} placeholder="Type a qualification and press Enter" aria-label="Qualifications" />
            </label>
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" disabled={submitting} className="login-submit">
            {React.createElement(FiUserPlus as any)} Sign up as manager
          </button>
          <p className="login-footer">
            Already have an account? <a href="/login">Sign in</a>.
          </p>
        </form>
      </div>
    </div>
  );
}

export function SignUp() {
  return <SignUpForm />;
}
