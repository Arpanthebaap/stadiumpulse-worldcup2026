/**
 * simulator.js
 *
 * Stands in for a real stadium IoT/CCTV feed (turnstile counters, crowd-density
 * cameras, queue-timer sensors, weather API). We do NOT have access to real
 * FIFA World Cup 2026 sensor data, so this generates a plausible, bounded,
 * seeded random-walk feed for each zone. This is documented in the README as
 * an explicit assumption -- swap `getZoneSnapshot()` for a real ingestion
 * adapter and the rest of the pipeline (decisionEngine -> gemini) is unchanged.
 */

const ZONES = [
  { id: "gate-a", label: "Gate A - Main Concourse", capacity: 6000 },
  { id: "gate-b", label: "Gate B - North Stand", capacity: 4500 },
  { id: "gate-c", label: "Gate C - South Stand", capacity: 4500 },
  { id: "gate-d", label: "Gate D - Family Zone", capacity: 3000 },
  { id: "concourse-1", label: "Concourse 1 - Food Court", capacity: 2500 },
  { id: "concourse-2", label: "Concourse 2 - Merchandise", capacity: 2000 },
  { id: "fan-zone", label: "Fan Zone Plaza", capacity: 8000 },
];

// in-memory state, one entry per zone: current occupancy, queue minutes, trend
const state = new Map();

function seedState() {
  for (const zone of ZONES) {
    state.set(zone.id, {
      occupancy: Math.round(zone.capacity * (0.3 + Math.random() * 0.3)),
      queueMinutes: Math.round(2 + Math.random() * 5),
      trend: 0, // -1 falling, 0 stable, 1 rising
      lastIncident: null,
    });
  }
}
seedState();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Advances the simulation by one tick (called on every /simulate request). */
function tick() {
  for (const zone of ZONES) {
    const s = state.get(zone.id);

    // random walk with mild momentum so the dashboard tells a coherent story
    const drift = (Math.random() - 0.45) * 0.06; // slight upward bias, feels "matchday"
    s.trend = clamp(s.trend + drift, -1, 1);

    const delta = Math.round(zone.capacity * s.trend * 0.03);
    s.occupancy = clamp(s.occupancy + delta, 0, zone.capacity + zone.capacity * 0.1);

    const occupancyRatio = s.occupancy / zone.capacity;
    s.queueMinutes = clamp(
      s.queueMinutes + (occupancyRatio > 0.85 ? 1 : -0.5) + (Math.random() - 0.5),
      0,
      45
    );

    // rare random incident injection so the copilot has something to triage
    if (!s.lastIncident && Math.random() < 0.015) {
      const incidents = [
        "Medical assistance requested",
        "Minor crowd surge reported",
        "Barrier malfunction reported",
        "Lost child reported",
      ];
      s.lastIncident = incidents[Math.floor(Math.random() * incidents.length)];
    } else if (s.lastIncident && Math.random() < 0.2) {
      s.lastIncident = null; // resolved
    }
  }
}

function getSnapshot() {
  tick();
  return ZONES.map((zone) => {
    const s = state.get(zone.id);
    const occupancyRatio = +(s.occupancy / zone.capacity).toFixed(3);
    return {
      id: zone.id,
      label: zone.label,
      capacity: zone.capacity,
      occupancy: Math.round(s.occupancy),
      occupancyRatio,
      queueMinutes: Math.round(s.queueMinutes),
      trend: s.trend > 0.15 ? "rising" : s.trend < -0.15 ? "falling" : "stable",
      incident: s.lastIncident,
      timestamp: new Date().toISOString(),
    };
  });
}

function getZoneById(id) {
  return getSnapshot().find((z) => z.id === id) || null;
}

export { getSnapshot, getZoneById, ZONES };
