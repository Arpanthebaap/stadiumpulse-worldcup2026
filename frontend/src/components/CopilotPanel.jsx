import React, { useEffect, useState } from "react";
import { getRecommendation, postTriage } from "../api.js";

export default function CopilotPanel({ selectedZoneId }) {
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [report, setReport] = useState("");
  const [triage, setTriage] = useState(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState(null);

  useEffect(() => {
    if (!selectedZoneId) return;
    setLoading(true);
    setError(null);
    getRecommendation(selectedZoneId)
      .then(setRecommendation)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedZoneId]);

  async function handleTriage(e) {
    e.preventDefault();
    if (!report.trim()) return;
    setTriageLoading(true);
    setTriageError(null);
    try {
      const result = await postTriage(report.trim());
      setTriage(result);
    } catch (err) {
      setTriageError(err.message);
    } finally {
      setTriageLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="panel">
        <div className="panel-title">Decision copilot</div>
        <div className="panel-desc">
          Select a zone on the left. Severity is decided by fixed thresholds — the copilot only
          explains and prioritizes the recommendation in plain language.
        </div>

        {!selectedZoneId && <div className="empty-state">No zone selected yet.</div>}
        {loading && <div className="empty-state">Thinking…</div>}
        {error && <div className="error-note">{error}</div>}

        {recommendation && !loading && (
          <>
            <div className="recommendation-box">{recommendation.narration.summary}</div>
            {recommendation.narration.mock && (
              <div className="mock-note">
                ⚠ GEMINI_API_KEY not set — showing a deterministic mock narration.
              </div>
            )}
            <ul className="action-list">
              {recommendation.actions.map((a, i) => (
                <li className="action-item" key={i}>
                  <strong>{a.action.replaceAll("_", " ")}</strong> — {a.detail}
                </li>
              ))}
              {!recommendation.actions.length && (
                <li className="action-item">No action needed — zone is within normal range.</li>
              )}
            </ul>
          </>
        )}
      </div>

      <div className="panel">
        <div className="panel-title">Incident triage</div>
        <div className="panel-desc">
          Type what a steward radios in. The copilot returns a structured severity, unit, and
          first dispatch message — it never contacts anyone automatically.
        </div>
        <form onSubmit={handleTriage} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea
            rows={3}
            maxLength={500}
            placeholder="e.g. Fan feeling unwell near Section 12, conscious and responsive"
            value={report}
            onChange={(e) => setReport(e.target.value)}
            aria-label="Incident report text"
          />
          <button className="btn" type="submit" disabled={triageLoading || !report.trim()}>
            {triageLoading ? "Triaging…" : "Triage report"}
          </button>
        </form>
        {triageError && <div className="error-note">{triageError}</div>}
        {triage && (
          <div className="recommendation-box">
            <div>
              <span className={`severity-tag severity-${triage.severity}`}>{triage.severity}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <strong>Suggested unit:</strong> {triage.suggestedUnit}
            </div>
            <div style={{ marginTop: 6 }}>
              <strong>First message:</strong> {triage.firstMessage}
            </div>
            {triage.mock && <div className="mock-note" style={{ marginTop: 8 }}>⚠ Mock triage (no API key set).</div>}
          </div>
        )}
      </div>
    </div>
  );
}
