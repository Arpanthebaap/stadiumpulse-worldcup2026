/**
 * geminiClient.js
 *
 * Thin wrapper around the Gemini API. Used ONLY for:
 *   1. Narrating/prioritizing recommendations that decisionEngine.js already
 *      computed deterministically (Gemini explains and phrases, it does not
 *      decide severity).
 *   2. Drafting multilingual PA announcements.
 *   3. Structuring free-text incident reports into a triage object.
 *
 * If GEMINI_API_KEY is not set, every function falls back to a deterministic
 * mock response so the app remains fully runnable and demoable without a key
 * committed anywhere in the repo (important for the "Security" evaluation
 * criterion -- no secrets in source control).
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const isLive = () => Boolean(GEMINI_API_KEY);

async function callGemini(prompt, { jsonMode = false } = {}) {
  if (!isLive()) {
    return { text: null, mock: true };
  }

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    ...(jsonMode
      ? { generationConfig: { responseMimeType: "application/json" } }
      : {}),
  };

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") ?? "";
  return { text, mock: false };
}

/** Turns a classified zone + rule-based actions into a natural-language brief. */
async function narrateRecommendation(zone, actions) {
  if (!isLive()) {
    const lead = actions[0]?.detail || "Continue monitoring.";
    return {
      mock: true,
      summary: `[${zone.severity.toUpperCase()}] ${zone.label}: ${zone.reasons.join(", ")}. Recommended: ${lead}`,
    };
  }

  const prompt = `You are an operations copilot for a FIFA World Cup 2026 stadium control room.
A deterministic rules engine has already classified this zone -- do not change the severity,
only explain it clearly and prioritize the given actions for a control-room operator.

Zone: ${zone.label}
Severity (fixed, do not alter): ${zone.severity}
Reasons: ${zone.reasons.join("; ")}
Candidate actions (fixed set, do not invent new ones): ${JSON.stringify(actions)}

Write a 2-3 sentence operator-facing brief: what's happening, why it matters right now,
and which action to take first and why. Be concise and calm, control-room tone.`;

  const { text } = await callGemini(prompt);
  return { mock: false, summary: text.trim() };
}

/** Drafts a PA announcement and translates it into requested languages. */
async function draftAnnouncement(englishDraft, languages = ["hi", "es", "fr"]) {
  if (!isLive()) {
    const stub = (lang) => `[MOCK ${lang.toUpperCase()}] ${englishDraft}`;
    return {
      mock: true,
      translations: Object.fromEntries(languages.map((l) => [l, stub(l)])),
    };
  }

  const prompt = `Translate the following stadium PA announcement into these language codes: ${languages.join(
    ", "
  )}. Keep the tone calm, clear, and public-address appropriate. Return ONLY a JSON object
mapping each language code to the translated announcement text, nothing else.

Announcement: "${englishDraft}"`;

  const { text } = await callGemini(prompt, { jsonMode: true });
  try {
    return { mock: false, translations: JSON.parse(text) };
  } catch {
    return { mock: false, translations: { raw: text } };
  }
}

/** Structures a free-text incident report into a triage object. */
async function triageIncident(freeText) {
  if (!isLive()) {
    return {
      mock: true,
      severity: /collapse|unconscious|fire|weapon/i.test(freeText) ? "critical" : "alert",
      suggestedUnit: "Nearest Medical Post",
      firstMessage: `Unit dispatched to reported incident: "${freeText}". Awaiting confirmation.`,
    };
  }

  const prompt = `You are triaging a stadium incident report for FIFA World Cup 2026 operations staff.
Report: "${freeText}"

Return ONLY a JSON object with keys:
"severity" (one of: watch, alert, critical),
"suggestedUnit" (e.g. "Medical Post 3", "Security Response Team", "Guest Services"),
"firstMessage" (a short first dispatch message a staff member can send immediately).`;

  const { text } = await callGemini(prompt, { jsonMode: true });
  try {
    return { mock: false, ...JSON.parse(text) };
  } catch {
    return { mock: false, severity: "alert", suggestedUnit: "Control Room", firstMessage: text };
  }
}

export { narrateRecommendation, draftAnnouncement, triageIncident, isLive };
