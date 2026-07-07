import test from "node:test";
import assert from "node:assert/strict";
import { classifyZone, suggestActions } from "../services/decisionEngine.js";

function makeZone(overrides = {}) {
  return {
    id: "gate-a",
    label: "Gate A - Main Concourse",
    capacity: 6000,
    occupancy: 1800,
    occupancyRatio: 0.3,
    queueMinutes: 3,
    trend: "stable",
    incident: null,
    ...overrides,
  };
}

test("normal occupancy classifies as normal severity", () => {
  const result = classifyZone(makeZone());
  assert.equal(result.severity, "normal");
  assert.equal(result.reasons.length, 0);
});

test("occupancy over 90% classifies as alert", () => {
  const result = classifyZone(makeZone({ occupancyRatio: 0.92 }));
  assert.equal(result.severity, "alert");
});

test("occupancy at or over capacity classifies as critical", () => {
  const result = classifyZone(makeZone({ occupancyRatio: 1.02 }));
  assert.equal(result.severity, "critical");
});

test("long queue alone can trigger alert severity", () => {
  const result = classifyZone(makeZone({ queueMinutes: 20 }));
  assert.equal(result.severity, "alert");
});

test("an active incident forces at least alert severity", () => {
  const result = classifyZone(makeZone({ incident: "Medical assistance requested" }));
  assert.equal(result.severity, "alert");
  assert.ok(result.reasons.some((r) => r.includes("Medical")));
});

test("critical zones receive concrete candidate actions", () => {
  const classified = classifyZone(makeZone({ occupancyRatio: 1.05, queueMinutes: 30 }));
  const actions = suggestActions(classified);
  assert.ok(actions.length > 0);
  assert.ok(actions.some((a) => a.action === "open_auxiliary_entry"));
});

test("watch-tier zones only get a monitor action, no overreaction", () => {
  const classified = classifyZone(makeZone({ occupancyRatio: 0.8 }));
  assert.equal(classified.severity, "watch");
  const actions = suggestActions(classified);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].action, "monitor");
});

test("falling trend does not append 'trend rising' to reasons", () => {
  const result = classifyZone(makeZone({ occupancyRatio: 0.8, trend: "falling" }));
  assert.equal(result.severity, "watch");
  assert.ok(!result.reasons.includes("trend rising"));
});

