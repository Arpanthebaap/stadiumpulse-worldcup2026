import React, { useEffect, useState, useCallback } from "react";
import ZoneCard from "./ZoneCard.jsx";
import { getSnapshot } from "../api.js";

const POLL_MS = 4000;

function ZoneCardSkeleton() {
  return (
    <div className="skeleton-card skeleton-shimmer">
      <div className="zone-card-head">
        <div className="skeleton-text skeleton-label" />
        <div className="skeleton-text skeleton-tag" />
      </div>
      <div className="skeleton-strip">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="skeleton-bar" />
        ))}
      </div>
      <div className="skeleton-metrics">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton-metric">
            <div className="skeleton-text skeleton-value" />
            <div className="skeleton-text skeleton-name" />
          </div>
        ))}
      </div>
    </div>
  );
}

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
        <div className="error-note" role="alert">
          Couldn't reach the backend ({error}). Is the API running on the configured URL?
        </div>
      )}
      <div className="zone-grid">
        {zones.length > 0 ? (
          zones.map((zone) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              selected={zone.id === selectedZoneId}
              onSelect={onSelectZone}
            />
          ))
        ) : !error ? (
          Array.from({ length: 7 }).map((_, i) => <ZoneCardSkeleton key={i} />)
        ) : null}
      </div>
    </div>
  );
}
