import React from "react";

const BAR_COUNT = 12;

function severityLabel(severity) {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

/** Renders a small animated "pulse strip" whose bar heights are seeded from
 * occupancy ratio so each zone's rhythm looks distinct rather than uniform. */
function PulseStrip({ occupancyRatio, severity }) {
  const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
    const base = 0.3 + occupancyRatio * 0.7;
    const wobble = Math.sin(i * 1.7) * 0.15;
    const delay = (i / BAR_COUNT) * 1.2;
    return { height: Math.max(0.2, Math.min(1, base + wobble)), delay };
  });

  return (
    <div className="pulse-strip" aria-hidden="true">
      {bars.map((bar, i) => (
        <div
          key={i}
          className="pulse-bar"
          style={{
            height: `${bar.height * 100}%`,
            animationDelay: `${bar.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function ZoneCard({ zone, selected, onSelect }) {
  return (
    <button
      className={`zone-card severity-${zone.severity}${selected ? " selected" : ""}`}
      onClick={() => onSelect(zone.id)}
      aria-pressed={selected}
      aria-label={`${zone.label}, severity ${zone.severity}, occupancy ${Math.round(
        zone.occupancyRatio * 100
      )} percent`}
    >
      <div className="zone-card-head">
        <span className="zone-label">{zone.label}</span>
        <span className={`severity-tag severity-${zone.severity}`}>
          {severityLabel(zone.severity)}
        </span>
      </div>

      <PulseStrip occupancyRatio={zone.occupancyRatio} severity={zone.severity} />

      <div className="zone-metrics">
        <div className="metric">
          <span className="metric-value">{Math.round(zone.occupancyRatio * 100)}%</span>
          <span className="metric-label">Occupancy</span>
        </div>
        <div className="metric">
          <span className="metric-value">{zone.queueMinutes}m</span>
          <span className="metric-label">Queue</span>
        </div>
        <div className="metric">
          <span className="metric-value">{zone.trend === "rising" ? "↑" : zone.trend === "falling" ? "↓" : "→"}</span>
          <span className="metric-label">Trend</span>
        </div>
      </div>

      {zone.incident && <div className="incident-flag">⚠ {zone.incident}</div>}
    </button>
  );
}
