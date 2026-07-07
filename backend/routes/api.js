import { Router } from "express";
import { getSnapshot, getZoneById } from "../services/simulator.js";
import { classifySnapshot, suggestActions } from "../services/decisionEngine.js";
import {
  narrateRecommendation,
  draftAnnouncement,
  triageIncident,
  isLive,
} from "../services/geminiClient.js";

const router = Router();

// simple in-memory rate limiter per IP for the Gemini-backed endpoints
// (Security / Efficiency: protects the API key from abuse and keeps cost bounded)
const rateBuckets = new Map();
const RATE_LIMIT = 20; // requests
const RATE_WINDOW_MS = 60_000;

function rateLimit(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const bucket = rateBuckets.get(key) || [];
  const recent = bucket.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    return res.status(429).json({ error: "Rate limit exceeded. Try again shortly." });
  }
  recent.push(now);
  rateBuckets.set(key, recent);
  next();
}

/** GET /api/status - simple health/config check (no secrets exposed) */
router.get("/status", (req, res) => {
  res.json({ ok: true, geminiLive: isLive() });
});

/** GET /api/simulate - live ops snapshot, classified + prioritized */
router.get("/simulate", (req, res) => {
  const snapshot = getSnapshot();
  const classified = classifySnapshot(snapshot);
  res.json({ zones: classified });
});

/** GET /api/decide/:zoneId - full recommendation for one zone (rules + Gemini narration) */
router.get("/decide/:zoneId", rateLimit, async (req, res) => {
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
router.post("/announce", rateLimit, async (req, res) => {
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
router.post("/triage", rateLimit, async (req, res) => {
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
