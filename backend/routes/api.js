import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getSnapshot, getZoneById } from "../services/simulator.js";
import { classifyZone, classifySnapshot, suggestActions } from "../services/decisionEngine.js";
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

/**
 * Wraps a Gemini-backed route handler so every route doesn't repeat the same
 * try/catch/502 boilerplate. Each handler returns its JSON payload (or
 * throws an Error, optionally with a `statusCode`); this wrapper turns a
 * thrown error into the right status code with a `detail` field, and a
 * returned value into a 200 JSON response.
 * @param {string} failureMessage - shown in the "error" field on an unexpected (502) failure
 * @param {(req: import('express').Request) => Promise<object>} handler
 */
function asyncGeminiRoute(failureMessage, handler) {
  return async (req, res) => {
    try {
      const payload = await handler(req);
      res.json(payload);
    } catch (err) {
      const statusCode = err.statusCode || 502;
      const errorLabel = err.statusCode ? err.message : failureMessage;
      const body = { error: errorLabel };
      if (!err.statusCode) body.detail = String(err.message || err);
      res.status(statusCode).json(body);
    }
  };
}

/**
 * Validates that `value` is a non-empty string under `maxLength`.
 * @param {unknown} value
 * @param {number} [maxLength]
 * @returns {string|null} the trimmed string, or null if invalid
 */
function validateShortText(value, maxLength = 500) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

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
router.get(
  "/decide/:zoneId",
  geminiRateLimit,
  asyncGeminiRoute("Copilot narration failed", async (req) => {
    const zone = getZoneById(req.params.zoneId);
    if (!zone) {
      const notFound = new Error("Zone not found");
      notFound.statusCode = 404;
      throw notFound;
    }
    const classified = classifyZone(zone);
    const actions = suggestActions(classified);
    const narration = await narrateRecommendation(classified, actions);
    return { zone: classified, actions, narration };
  })
);

/** POST /api/announce { text, languages } - draft + translate a PA announcement */
router.post(
  "/announce",
  geminiRateLimit,
  asyncGeminiRoute("Announcement drafting failed", async (req) => {
    const text = validateShortText(req.body?.text);
    if (!text) {
      const badRequest = new Error("Provide 'text' (string, max 500 chars).");
      badRequest.statusCode = 400;
      throw badRequest;
    }
    const { languages } = req.body || {};
    const safeLangs =
      Array.isArray(languages) && languages.length ? languages.slice(0, 6).map(String) : ["hi", "es", "fr"];
    return draftAnnouncement(text, safeLangs);
  })
);

/** POST /api/triage { report } - structure a free-text incident report */
router.post(
  "/triage",
  geminiRateLimit,
  asyncGeminiRoute("Triage failed", async (req) => {
    const report = validateShortText(req.body?.report);
    if (!report) {
      const badRequest = new Error("Provide 'report' (string, max 500 chars).");
      badRequest.statusCode = 400;
      throw badRequest;
    }
    return triageIncident(report);
  })
);

export default router;
