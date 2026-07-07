/**
 * decisionEngine.js
 *
 * This is the deterministic "brain" of StadiumPulse. It never calls an LLM.
 * Its job is to turn raw sensor snapshots into structured, explainable
 * severity classifications and candidate actions using fixed thresholds.
 *
 * Why a rules layer at all, instead of asking Gemini to "decide everything"?
 *   1. Safety: an LLM should never be the sole authority declaring a real-world
 *      emergency state. The rules engine is the source of truth for WHAT is
 *      happening; Gemini is only used to explain, prioritize in natural
 *      language, and phrase communications -- it cannot invent a crisis that
 *      the sensor data doesn't support.
 *   2. Testability: thresholds are pure functions, so they're trivially unit
 *      tested (see tests/decisionEngine.test.js) without mocking an API.
 *   3. Efficiency: only zones that cross a threshold are sent to Gemini at
 *      all, which keeps token usage (and cost/latency) low.
 */

const THRESHOLDS = {
  occupancy: { watch: 0.75, alert: 0.9, critical: 1.0 },
  queueMinutes: { watch: 10, alert: 18, critical: 28 },
};

/**
 * Classifies a single zone snapshot into a severity tier with the specific
 * reasons that triggered it. Pure function, no side effects.
 */
function classifyZone(zone) {
  const reasons = [];
  let severity = "normal";

  const bump = (level) => {
    const order = { normal: 0, watch: 1, alert: 2, critical: 3 };
    if (order[level] > order[severity]) severity = level;
  };

  if (zone.occupancyRatio >= THRESHOLDS.occupancy.critical) {
    bump("critical");
    reasons.push(`occupancy at ${(zone.occupancyRatio * 100).toFixed(0)}% (over capacity)`);
  } else if (zone.occupancyRatio >= THRESHOLDS.occupancy.alert) {
    bump("alert");
    reasons.push(`occupancy at ${(zone.occupancyRatio * 100).toFixed(0)}% of capacity`);
  } else if (zone.occupancyRatio >= THRESHOLDS.occupancy.watch) {
    bump("watch");
    reasons.push(`occupancy trending high at ${(zone.occupancyRatio * 100).toFixed(0)}%`);
  }

  if (zone.queueMinutes >= THRESHOLDS.queueMinutes.critical) {
    bump("critical");
    reasons.push(`queue wait at ${zone.queueMinutes} min`);
  } else if (zone.queueMinutes >= THRESHOLDS.queueMinutes.alert) {
    bump("alert");
    reasons.push(`queue wait at ${zone.queueMinutes} min`);
  } else if (zone.queueMinutes >= THRESHOLDS.queueMinutes.watch) {
    bump("watch");
    reasons.push(`queue building at ${zone.queueMinutes} min`);
  }

  if (zone.trend === "rising" && severity !== "normal") {
    reasons.push("trend rising");
  }

  if (zone.incident) {
    bump("alert");
    reasons.push(`active incident: ${zone.incident}`);
  }

  return { ...zone, severity, reasons };
}

/** Classifies an entire snapshot array and sorts most-severe first. */
function classifySnapshot(snapshot) {
  const order = { critical: 0, alert: 1, watch: 2, normal: 3 };
  return snapshot
    .map(classifyZone)
    .sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * Produces the candidate action set for a classified zone. This is the
 * "logical decision making" layer -- fixed operational playbook rules, not
 * an LLM guess. Gemini later narrates/prioritizes these, it does not author
 * them from scratch.
 */
function suggestActions(classifiedZone) {
  const actions = [];
  const { severity, occupancyRatio, queueMinutes, incident, label } = classifiedZone;

  if (severity === "critical" || severity === "alert") {
    if (occupancyRatio >= THRESHOLDS.occupancy.alert) {
      actions.push({
        action: "open_auxiliary_entry",
        detail: `Open auxiliary access point near ${label} and redirect adjacent-zone foot traffic.`,
      });
      actions.push({
        action: "deploy_staff",
        detail: `Deploy 2-3 additional stewards to ${label} for flow control.`,
      });
    }
    if (queueMinutes >= THRESHOLDS.queueMinutes.alert) {
      actions.push({
        action: "open_additional_lane",
        detail: `Open additional screening/ticket lane(s) at ${label}.`,
      });
    }
    if (incident) {
      actions.push({
        action: "dispatch_response_unit",
        detail: `Dispatch nearest response unit to ${label} for: ${incident}.`,
      });
    }
  } else if (severity === "watch") {
    actions.push({
      action: "monitor",
      detail: `Continue monitoring ${label}; no action required yet, re-check in next cycle.`,
    });
  }

  return actions;
}

export { classifyZone, classifySnapshot, suggestActions, THRESHOLDS };
