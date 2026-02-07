/**
 * Education picker: degree level dropdown + school name search (public universities API).
 * Value is an array of { degree, school }; stored in DB as string[] "Degree, School".
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import "./EducationPicker.css";

export interface EducationEntry {
  degree: string;
  school: string;
}

const DEGREE_LEVELS = [
  "High School",
  "Associate",
  "Bachelor's",
  "Master's",
  "MBA",
  "Doctorate",
  "PhD",
  "Certificate",
  "Diploma",
  "Other",
];

async function searchUniversities(query: string): Promise<{ name: string; country?: string }[]> {
  if (!query.trim() || query.length < 2) return [];
  try {
    const targetUrl = "http://universities.hipolabs.com/search?name=" + encodeURIComponent(query.trim());
    const res = await fetch("https://api.allorigins.win/raw?url=" + encodeURIComponent(targetUrl));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.slice(0, 15) : [];
  } catch {
    return [];
  }
}

/** Parse "Degree, School" or "School" into an entry. */
export function parseEducationString(s: string): EducationEntry {
  const trimmed = s.trim();
  const comma = trimmed.indexOf(",");
  if (comma > 0) {
    const degree = trimmed.slice(0, comma).trim();
    const school = trimmed.slice(comma + 1).trim();
    return { degree: degree || "Other", school: school || trimmed };
  }
  return { degree: "Other", school: trimmed || "" };
}

/** Serialize entry to string for storage. */
export function educationEntryToString(e: EducationEntry): string {
  if (!e.school) return "";
  return e.degree ? `${e.degree}, ${e.school}` : e.school;
}

export function educationEntriesToStrings(entries: EducationEntry[]): string[] {
  return entries.map(educationEntryToString).filter(Boolean);
}

export function stringsToEducationEntries(strings: string[]): EducationEntry[] {
  return strings.map(parseEducationString).filter((e) => e.school);
}

interface EducationPickerProps {
  value: EducationEntry[];
  onChange: (value: EducationEntry[]) => void;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

export function EducationPicker({ value, onChange, className, id, "aria-label": ariaLabel }: EducationPickerProps) {
  const [schoolQuery, setSchoolQuery] = useState("");
  const [newDegree, setNewDegree] = useState("Bachelor's");
  const [suggestions, setSuggestions] = useState<{ name: string; country?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    setLoading(true);
    const list = await searchUniversities(q);
    setSuggestions(list);
    setLoading(false);
    setFocusedIndex(-1);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!schoolQuery.trim()) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(schoolQuery), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [schoolQuery, fetchSuggestions]);

  const addEntry = (degree: string, school: string) => {
    if (!school.trim()) return;
    onChange([...value, { degree, school: school.trim() }]);
    setSchoolQuery("");
    setSuggestions([]);
  };

  const removeEntry = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateEntry = (index: number, patch: Partial<EducationEntry>) => {
    const next = value.map((e, i) => (i === index ? { ...e, ...patch } : e));
    onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && suggestions.length > 0 && focusedIndex >= 0 && suggestions[focusedIndex]) {
      e.preventDefault();
      addEntry(newDegree, suggestions[focusedIndex].name);
      return;
    }
    if (e.key === "Enter" && schoolQuery.trim()) {
      e.preventDefault();
      addEntry(newDegree, schoolQuery.trim());
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => (i < suggestions.length - 1 ? i + 1 : i));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => (i > 0 ? i - 1 : -1));
    }
  };

  return (
    <div className={className} id={id} aria-label={ariaLabel}>
      <div className="education-picker__list">
        {value.map((entry, index) => (
          <div key={index} className="education-picker__row">
            <select
              className="education-picker__degree"
              value={entry.degree}
              onChange={(e) => updateEntry(index, { degree: e.target.value })}
              aria-label="Degree level"
            >
              {DEGREE_LEVELS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <span className="education-picker__school-label">{entry.school || "—"}</span>
            <button
              type="button"
              className="education-picker__remove"
              onClick={() => removeEntry(index)}
              aria-label="Remove"
            >
              {React.createElement(FiTrash2 as any)}
            </button>
          </div>
        ))}
      </div>
      <div className="education-picker__add">
        <div className="education-picker__add-inner">
          <select
            className="education-picker__degree education-picker__degree--add"
            value={newDegree}
            onChange={(e) => setNewDegree(e.target.value)}
            aria-label="Degree for new entry"
          >
            {DEGREE_LEVELS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <div className="education-picker__school-wrap">
            <input
              type="text"
              className="education-picker__school-input"
              placeholder="Search or type school name..."
              value={schoolQuery}
              onChange={(e) => setSchoolQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="School name"
              aria-autocomplete="list"
              aria-expanded={suggestions.length > 0}
            />
            {suggestions.length > 0 && (
              <ul ref={listRef} className="education-picker__suggestions" role="listbox">
                {suggestions.map((s, i) => (
                  <li
                    key={s.name + (s.country ?? "")}
                    role="option"
                    aria-selected={i === focusedIndex}
                    className={`education-picker__suggestion ${i === focusedIndex ? "education-picker__suggestion--focused" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addEntry(newDegree, s.name);
                    }}
                  >
                    {s.name}
                    {s.country ? ` (${s.country})` : ""}
                  </li>
                ))}
              </ul>
            )}
            {loading && <span className="education-picker__loading">Searching…</span>}
          </div>
          <button
            type="button"
            className="education-picker__add-btn"
            onClick={() => { if (schoolQuery.trim()) addEntry(newDegree, schoolQuery.trim()); }}
            aria-label="Add education"
          >
            {React.createElement(FiPlus as any)} Add
          </button>
        </div>
      </div>
    </div>
  );
}
