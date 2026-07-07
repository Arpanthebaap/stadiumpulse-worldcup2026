import React, { useEffect, useState, useCallback } from "react";
import ZoneCard from "./ZoneCard.jsx";
import { getSnapshot } from "../api.js";

const POLL_MS = 4000;

export default function Dashboard({ selectedZoneId, onSelectZone }) {
  const [zones, setZones] = useState([]);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getSnapshot();
      setZones(data.zones);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div>
      <div className="section-label">Live venue snapshot · updates every {POLL_MS / 1000}s</div>
      {error && (
        <div className="error-note" role="alert" aria-live="assertive">
          Couldn't reach the backend ({error}). Is the API running on the configured URL?
        </div>
      )}
      <div className="zone-grid">
        {zones.map((zone) => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            selected={zone.id === selectedZoneId}
            onSelect={onSelectZone}
          />
        ))}
        {!zones.length && !error && <div className="empty-state">Loading live zones…</div>}
      </div>
    </div>
  );
}
