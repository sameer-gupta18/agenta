/**
 * Tag input: type a word and press Enter to add a tag. Tags shown as chips with remove.
 */

import React, { useState, useCallback } from "react";
import { FiX } from "react-icons/fi";
import "./TagInput.css";

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
  /** Max number of tags allowed; adding is disabled when at limit. */
  maxTags?: number;
}

export function TagInput({ value, onChange, placeholder = "Type a skill and press Enter", className, id, "aria-label": ariaLabel, maxTags }: TagInputProps) {
  const [input, setInput] = useState("");
  const atLimit = typeof maxTags === "number" && value.length >= maxTags;

  const addTag = useCallback(
    (raw: string) => {
      if (atLimit) return;
      const tag = raw.trim();
      if (!tag || value.includes(tag)) return;
      const next = [...value, tag];
      onChange(typeof maxTags === "number" ? next.slice(0, maxTags) : next);
      setInput("");
    },
    [value, onChange, atLimit, maxTags]
  );

  const removeTag = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === "Backspace" && !input && value.length > 0) {
      removeTag(value.length - 1);
    }
  };

  return (
    <div className={`tag-input ${className ?? ""}`} id={id} aria-label={ariaLabel}>
      <div className="tag-input__chips">
        {value.map((tag, i) => (
          <span key={i} className="tag-input__chip">
            {tag}
            <button
              type="button"
              className="tag-input__remove"
              onClick={() => removeTag(i)}
              aria-label={`Remove ${tag}`}
            >
              {React.createElement(FiX as any)}
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        className="tag-input__field"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={atLimit ? (typeof maxTags === "number" ? `Maximum ${maxTags} skills` : "Add another…") : value.length === 0 ? placeholder : "Add another…"}
        disabled={atLimit}
        aria-label={ariaLabel ?? "Add tag"}
      />
    </div>
  );
}
