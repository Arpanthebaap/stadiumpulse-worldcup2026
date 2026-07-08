import test from "node:test";
import assert from "node:assert/strict";
import { getSnapshot, getZoneById, ZONES } from "../services/simulator.js";

test("getSnapshot returns exactly one entry per defined zone", () => {
  const snapshot = getSnapshot();
  assert.equal(snapshot.length, ZONES.length);
  const ids = snapshot.map((z) => z.id).sort();
  assert.deepEqual(ids, ZONES.map((z) => z.id).sort());
});

test("every zone snapshot has the expected shape and value types", () => {
  const snapshot = getSnapshot();
  for (const zone of snapshot) {
    assert.equal(typeof zone.id, "string");
    assert.equal(typeof zone.label, "string");
    assert.equal(typeof zone.capacity, "number");
    assert.equal(typeof zone.occupancy, "number");
    assert.equal(typeof zone.occupancyRatio, "number");
    assert.equal(typeof zone.queueMinutes, "number");
    assert.ok(["rising", "falling", "stable"].includes(zone.trend));
    assert.ok(zone.incident === null || typeof zone.incident === "string");
    assert.ok(!Number.isNaN(Date.parse(zone.timestamp)));
  }
});

test("occupancy never goes negative and queue time stays within bounds", () => {
  // run several ticks to exercise the random walk
  for (let i = 0; i < 25; i++) {
    const snapshot = getSnapshot();
    for (const zone of snapshot) {
      assert.ok(zone.occupancy >= 0, `${zone.id} occupancy went negative`);
      assert.ok(zone.queueMinutes >= 0 && zone.queueMinutes <= 45, `${zone.id} queueMinutes out of bounds`);
    }
  }
});

test("getZoneById returns null for an unknown zone id", () => {
  assert.equal(getZoneById("not-a-real-zone"), null);
});

test("getZoneById returns a matching snapshot for a known zone id", () => {
  const zone = getZoneById("gate-a");
  assert.ok(zone);
  assert.equal(zone.id, "gate-a");
});
