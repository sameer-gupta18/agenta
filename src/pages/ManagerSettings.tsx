import React, { useState, useEffect } from "react";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { ManagerRecord } from "../types";
import { FiSettings } from "react-icons/fi";
import "./ManagerDashboard.css";

const GENDER_OPTIONS = ["", "Female", "Male", "Non-binary", "Other", "Prefer not to say"];

export function ManagerSettings() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ManagerRecord | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      return yield* fs.getManager(user.uid);
    });
    Effect.runPromise(runWithAppLayer(program))
      .then((p) => {
        if (p) {
          setProfile(p);
          setEmail(p.email ?? "");
          setDisplayName(p.displayName ?? "");
          setGender(p.gender ?? "");
          setPhone(p.phone ?? "");
          setBio(p.bio ?? "");
        }
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [user?.uid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const program = Effect.gen(function* () {
        const fs = yield* FirestoreService;
        yield* fs.updateManagerRecord(user.uid, {
          displayName: displayName.trim() || undefined,
          gender: gender.trim() || undefined,
          phone: phone.trim() || undefined,
          bio: bio.trim() || undefined,
        });
      });
      await Effect.runPromise(runWithAppLayer(program));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="manager-dash manager-dash--page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="manager-dash manager-dash--page">
      <h1 className="manager-page-title">
        {React.createElement(FiSettings as any)} Settings
      </h1>
      <p className="muted" style={{ marginBottom: "1.5rem" }}>
        Edit your details.
      </p>

      {error && (
        <div className="dash-error">
          {error}
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      {saved && (
        <div className="manager-settings-saved">Settings saved.</div>
      )}

      <form onSubmit={handleSubmit} className="project-form manager-settings-form">
        <label>
          <span>Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </label>
        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            readOnly
            title="Email cannot be changed here."
          />
          <small className="muted">Email cannot be changed here.</small>
        </label>
        <label>
          <span>Gender</span>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="manager-settings-select"
          >
            {GENDER_OPTIONS.map((opt) => (
              <option key={opt || "empty"} value={opt}>{opt || "Select gender"}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Phone</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 234 567 8900"
          />
        </label>
        <label>
          <span>Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Short bio"
            rows={3}
          />
        </label>
        <div className="form-actions">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
