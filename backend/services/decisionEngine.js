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
 * Single source of truth for severity ordering. Used both to decide whether
 * a new finding should "bump" a zone's severity up (classifyZone) and to
 * sort a snapshot most-severe-first (classifySnapshot). Previously these
 * lived as two separately-typed-out objects that could silently drift out
 * of sync; consolidating avoids that class of bug.
 * @type {Record<"normal"|"watch"|"alert"|"critical", number>}
 */
const SEVERITY_RANK = { normal: 0, watch: 1, alert: 2, critical: 3 };

/**
 * @typedef {Object} ZoneSnapshot
 * @property {string} id
 * @property {string} label
 * @property {number} capacity
 * @property {number} occupancy
 * @property {number} occupancyRatio - 0..1+ (can exceed 1 if over capacity)
 * @property {number} queueMinutes
 * @property {"rising"|"falling"|"stable"} trend
 * @property {string|null} incident
 */

/**
 * @typedef {ZoneSnapshot & {severity: "normal"|"watch"|"alert"|"critical", reasons: string[]}} ClassifiedZone
 */

/**
 * @typedef {Object} CandidateAction
 * @property {string} action - machine-readable action key, e.g. "open_auxiliary_entry"
 * @property {string} detail - human-readable instruction for the operator
 */

/**
 * Classifies a single zone snapshot into a severity tier with the specific
 * reasons that triggered it. Pure function, no side effects.
 * @param {ZoneSnapshot} zone
 * @returns {ClassifiedZone}
 */
function classifyZone(zone) {
  /** @type {string[]} */
  const reasons = [];
  /** @type {"normal"|"watch"|"alert"|"critical"} */
  let severity = "normal";

  /** @param {"watch"|"alert"|"critical"} level */
  const bump = (level) => {
    if (SEVERITY_RANK[level] > SEVERITY_RANK[severity]) severity = level;
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

/**
 * Classifies an entire snapshot array and sorts most-severe first.
 * @param {ZoneSnapshot[]} snapshot
 * @returns {ClassifiedZone[]}
 */
function classifySnapshot(snapshot) {
  return snapshot
    .map(classifyZone)
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

/**
 * Produces the candidate action set for a classified zone. This is the
 * "logical decision making" layer -- fixed operational playbook rules, not
 * an LLM guess. Gemini later narrates/prioritizes these, it does not author
 * them from scratch.
 * @param {ClassifiedZone} classifiedZone
 * @returns {CandidateAction[]}
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

export { classifyZone, classifySnapshot, suggestActions, THRESHOLDS, SEVERITY_RANK };
