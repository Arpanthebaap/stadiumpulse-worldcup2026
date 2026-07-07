import React, { useState } from "react";
import { postAnnouncement } from "../api.js";

const LANGUAGE_OPTIONS = [
  { code: "hi", label: "Hindi" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "ar", label: "Arabic" },
  { code: "pt", label: "Portuguese" },
  { code: "de", label: "German" },
];

export default function AnnouncementComposer() {
  const [text, setText] = useState("");
  const [selectedLangs, setSelectedLangs] = useState(["hi", "es", "fr"]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function toggleLang(code) {
    setSelectedLangs((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim() || !selectedLangs.length) return;
    setLoading(true);
    setError(null);
    try {
      const data = await postAnnouncement(text.trim(), selectedLangs);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-title">Multilingual PA composer</div>
      <div className="panel-desc">
        Draft one announcement in English once, broadcast it in every language your venue needs —
        built for staff drafting under time pressure, not fans browsing a menu.
      </div>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <textarea
          rows={3}
          maxLength={500}
          placeholder="e.g. Gate B is temporarily closed. Please use Gate C for entry."
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Announcement draft in English"
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} role="group" aria-label="Target languages">
          {LANGUAGE_OPTIONS.map((lang) => (
            <label
              key={lang.code}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                color: selectedLangs.includes(lang.code) ? "var(--cyan)" : "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "5px 9px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={selectedLangs.includes(lang.code)}
                onChange={() => toggleLang(lang.code)}
                style={{ margin: 0 }}
              />
              {lang.label}
            </label>
          ))}
        </div>
        <button className="btn" type="submit" disabled={loading || !text.trim() || !selectedLangs.length}>
          {loading ? "Translating…" : "Draft & translate"}
        </button>
      </form>

      {error && <div className="error-note">{error}</div>}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {result.mock && (
            <div className="mock-note">⚠ GEMINI_API_KEY not set — showing mock translations.</div>
          )}
          {Object.entries(result.translations).map(([code, translation]) => (
            <div className="translation-item" key={code}>
              <span className="lang-code">{code.toUpperCase()}</span>
              <span>{translation}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
