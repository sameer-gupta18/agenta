import React, { useState, useEffect, useCallback } from "react";
import { Effect } from "effect";
import { useAuth } from "../contexts/AuthContext";
import { FirestoreService, runWithAppLayer } from "../lib/effect";
import type { EmployeeProfile as EmployeeProfileType } from "../types";
import { TagInput } from "../components/TagInput";
import { FiUser, FiSave, FiAward, FiBriefcase, FiTarget } from "react-icons/fi";
import "./EmployeeDashboard.css";

export function EmployeeProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<EmployeeProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    experience: "",
    workEx: "",
    skills: [] as string[],
    goals: "",
    preferences: "",
    favoriteCompanies: [] as string[],
    workExperience: [] as string[],
    awards: [] as string[],
    projects: [] as string[],
    dreams: "",
    aspirations: "",
  });

  const load = useCallback(() => {
    if (!user?.uid) return;
    setLoading(true);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      return yield* fs.getEmployeeProfile(user.uid);
    });
    Effect.runPromise(runWithAppLayer(program))
      .then((p) => {
        setProfile(p ?? null);
        if (p) {
          setForm({
            experience: p.experience ?? "",
            workEx: p.workEx ?? "",
            skills: p.skills ?? [],
            goals: p.goals ?? "",
            preferences: p.preferences ?? "",
            favoriteCompanies: p.favoriteCompanies ?? [],
            workExperience: p.workExperience ?? [],
            awards: p.awards ?? [],
            projects: p.projects ?? [],
            dreams: p.dreams ?? "",
            aspirations: p.aspirations ?? "",
          });
        }
      })
      .finally(() => setLoading(false));
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = useCallback(() => {
    if (!user?.uid) return;
    setSaving(true);
    setSaved(false);
    const program = Effect.gen(function* () {
      const fs = yield* FirestoreService;
      yield* fs.updateEmployeeProfile(user.uid, {
        experience: form.experience.trim() || undefined,
        workEx: form.workEx.trim() || undefined,
        skills: form.skills.length > 0 ? form.skills : undefined,
        goals: form.goals.trim() || undefined,
        preferences: form.preferences.trim() || undefined,
        favoriteCompanies: form.favoriteCompanies.length > 0 ? form.favoriteCompanies : undefined,
        workExperience: form.workExperience.length > 0 ? form.workExperience : undefined,
        awards: form.awards.length > 0 ? form.awards : undefined,
        projects: form.projects.length > 0 ? form.projects : undefined,
        dreams: form.dreams.trim() || undefined,
        aspirations: form.aspirations.trim() || undefined,
      });
    });
    Effect.runPromise(runWithAppLayer(program))
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      })
      .finally(() => setSaving(false));
  }, [user?.uid, form]);

  if (!user) return null;
  if (loading) return <div className="employee-dash-page"><p className="muted">Loading…</p></div>;

  return (
    <div className="employee-dash-page">
      <h1 className="employee-dash-page__title">
        {React.createElement(FiUser as any)} My profile
      </h1>
      <p className="muted employee-profile-intro" style={{ marginBottom: "1.5rem" }}>
        Edit your details and save.
      </p>

      <div className="employee-profile-form">
        <section className="employee-dash-section">
          <h2 className="employee-dash-section__heading">Experience & skills</h2>
          <label className="employee-prefs-label">Experience (summary)</label>
          <textarea className="employee-prefs-input" rows={2} value={form.experience} onChange={(e) => setForm((f) => ({ ...f, experience: e.target.value }))} placeholder="e.g. 5 years in software development" />
          <label className="employee-prefs-label">Work experience (tags)</label>
          <TagInput value={form.workExperience} onChange={(v) => setForm((f) => ({ ...f, workExperience: v }))} placeholder="e.g. Company X, Role, 2020-2023" maxTags={20} />
          <label className="employee-prefs-label">Skills (tags)</label>
          <TagInput value={form.skills} onChange={(v) => setForm((f) => ({ ...f, skills: v }))} placeholder="e.g. React, TypeScript" maxTags={25} />
        </section>

        <section className="employee-dash-section">
          <h2 className="employee-dash-section__heading">{React.createElement(FiAward as any)} Awards & projects</h2>
          <label className="employee-prefs-label">Awards / recognitions (tags)</label>
          <TagInput value={form.awards} onChange={(v) => setForm((f) => ({ ...f, awards: v }))} placeholder="e.g. Best performer Q2" maxTags={15} />
          <label className="employee-prefs-label">Projects — past or side (tags)</label>
          <TagInput value={form.projects} onChange={(v) => setForm((f) => ({ ...f, projects: v }))} placeholder="e.g. Open-source library X" maxTags={15} />
        </section>

        <section className="employee-dash-section">
          <h2 className="employee-dash-section__heading">{React.createElement(FiTarget as any)} Goals & aspirations</h2>
          <label className="employee-prefs-label">Goals (skills to grow, role direction)</label>
          <textarea className="employee-prefs-input" rows={2} value={form.goals} onChange={(e) => setForm((f) => ({ ...f, goals: e.target.value }))} placeholder="e.g. Lead more frontend projects" />
          <label className="employee-prefs-label">Dreams / long-term aspirations</label>
          <textarea className="employee-prefs-input" rows={2} value={form.dreams} onChange={(e) => setForm((f) => ({ ...f, dreams: e.target.value }))} placeholder="e.g. Start my own product one day" />
          <label className="employee-prefs-label">Short-term aspirations</label>
          <textarea className="employee-prefs-input" rows={2} value={form.aspirations} onChange={(e) => setForm((f) => ({ ...f, aspirations: e.target.value }))} placeholder="e.g. Ship feature X this quarter" />
          <label className="employee-prefs-label">Preferences (project types, work style)</label>
          <textarea className="employee-prefs-input" rows={2} value={form.preferences} onChange={(e) => setForm((f) => ({ ...f, preferences: e.target.value }))} placeholder="e.g. Prefer collaborative projects" />
          <label className="employee-prefs-label">Favorite or target companies (tags)</label>
          <TagInput value={form.favoriteCompanies} onChange={(v) => setForm((f) => ({ ...f, favoriteCompanies: v }))} placeholder="Type company and press Enter" maxTags={12} />
        </section>

        <div className="employee-prefs-actions">
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {React.createElement(FiSave as any)} {saving ? "Saving…" : saved ? "Saved" : "Save profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
