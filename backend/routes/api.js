import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getSnapshot, getZoneById } from "../services/simulator.js";
import { classifySnapshot, suggestActions } from "../services/decisionEngine.js";
import {
  narrateRecommendation,
  draftAnnouncement,
  triageIncident,
  isLive,
} from "../services/geminiClient.js";

const router = Router();

// Rate limiter for the Gemini-backed endpoints (Security / Efficiency: protects
// the API key from abuse and keeps cost bounded). Uses express-rate-limit
// instead of a hand-rolled Map so buckets are pruned automatically and don't
// grow unbounded on a long-running process.
const geminiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded. Try again shortly." },
});

/** GET /api/status - simple health/config check (no secrets exposed) */
router.get("/status", (req, res) => {
  res.json({ ok: true, geminiLive: isLive() });
});

// Efficiency: multiple browser tabs/operators polling at once would otherwise
// each trigger their own simulator tick and JSON serialization. A very short
// cache window collapses concurrent requests onto one computed snapshot
// without making the "live" feed feel stale (well under the 4s poll interval).
const SNAPSHOT_CACHE_MS = 1500;
let cachedSnapshot = null;
let cachedAt = 0;

/** GET /api/simulate - live ops snapshot, classified + prioritized */
router.get("/simulate", (req, res) => {
  const now = Date.now();
  if (!cachedSnapshot || now - cachedAt > SNAPSHOT_CACHE_MS) {
    cachedSnapshot = classifySnapshot(getSnapshot());
    cachedAt = now;
  }
  res.set("Cache-Control", "private, max-age=1");
  res.json({ zones: cachedSnapshot });
});

/** GET /api/decide/:zoneId - full recommendation for one zone (rules + Gemini narration) */
router.get("/decide/:zoneId", geminiRateLimit, async (req, res) => {
  const zone = getZoneById(req.params.zoneId);
  if (!zone) return res.status(404).json({ error: "Zone not found" });

  const { classifyZone } = await import("../services/decisionEngine.js");
  const classified = classifyZone(zone);
  const actions = suggestActions(classified);

  try {
    const narration = await narrateRecommendation(classified, actions);
    res.json({ zone: classified, actions, narration });
  } catch (err) {
    res.status(502).json({ error: "Copilot narration failed", detail: String(err.message || err) });
  }
});

/** POST /api/announce { text, languages } - draft + translate a PA announcement */
router.post("/announce", geminiRateLimit, async (req, res) => {
  const { text, languages } = req.body || {};
  if (!text || typeof text !== "string" || text.length > 500) {
    return res.status(400).json({ error: "Provide 'text' (string, max 500 chars)." });
  }
  const safeLangs = Array.isArray(languages) && languages.length
    ? languages.slice(0, 6).map(String)
    : ["hi", "es", "fr"];

  try {
    const result = await draftAnnouncement(text, safeLangs);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: "Announcement drafting failed", detail: String(err.message || err) });
  }
});

/** POST /api/triage { report } - structure a free-text incident report */
router.post("/triage", geminiRateLimit, async (req, res) => {
  const { report } = req.body || {};
  if (!report || typeof report !== "string" || report.length > 500) {
    return res.status(400).json({ error: "Provide 'report' (string, max 500 chars)." });
  }
  try {
    const result = await triageIncident(report);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: "Triage failed", detail: String(err.message || err) });
  }
});

export default router;
