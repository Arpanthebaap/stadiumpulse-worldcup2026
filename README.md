# StadiumPulse — GenAI Operations Copilot

**Challenge:** PromptWars Virtual · Challenge 4 · Smart Stadiums & Tournament Operations (FIFA World Cup 2026)
**Built with:** Google Antigravity

> Most "smart stadium" tools are built for the fan. StadiumPulse is built for the person the fan never sees: the volunteer, steward, or control-room operator making dozens of small logistics calls a minute, under time pressure, without enough visibility.

---

## 1. Chosen vertical

**Persona: On-ground staff / control-room operator**, not the fan-facing chatbot most teams default to.

The challenge lists fans, organizers, volunteers, and on-ground staff as valid personas. We deliberately chose staff because:

- It forces **real decision logic** instead of a lookup/translation bot — the brief explicitly asks for "logical decision making based on user context," which is much harder to demonstrate in a Q&A chatbot than in an operations tool.
- One coherent system for one persona can satisfy **three tracks at once** — crowd management, real-time decision support, and multi-language assistance — instead of three disconnected demo features bolted together.
- It's closer to how real venue operations centers actually work today (decision-support dashboards, not public chat widgets), which supports "practical and real-world usability."

## 2. Approach and logic

The core design decision: **a deterministic rules engine decides *what* is happening; Gemini only explains, prioritizes, and phrases it.**

```
Live signals (simulated)  →  Rules engine (decisionEngine.js)  →  Gemini (geminiClient.js)  →  Operator
     occupancy, queue,          fixed thresholds classify           narrates + prioritizes        sees a clear,
     incidents per zone         severity + candidate actions        the fixed output               explainable brief
```

Why not let the LLM decide severity directly?

1. **Safety** — an LLM should never be the sole authority declaring a real-world emergency state at a mass-gathering event. It can hallucinate, be prompt-injected via free text, or simply guess wrong. The rules engine is the single source of truth for severity; Gemini cannot override it, only narrate it.
2. **Testability** — thresholds are pure functions with no external dependency, so they're fully unit-tested (`backend/tests/decisionEngine.test.js`, 7 passing tests) without mocking an API.
3. **Efficiency** — only zones that actually cross a threshold get sent to Gemini at all, which keeps token usage, latency, and cost bounded — instead of asking the LLM to re-reason about six zones on every poll.

This hybrid pattern is the "unique way of approach" of this submission: **GenAI as narrator and translator over a deterministic operations core, not as the decision-maker itself.**

## 3. How the solution works

Four connected surfaces, one persona:

| Feature | What it does | Track it satisfies |
|---|---|---|
| **Live ops dashboard** | Six venue zones (gates, concourses) with occupancy %, queue time, and trend, refreshed every 4s. A "pulse strip" visualization gives an at-a-glance density readout per zone. | Dynamic crowd management |
| **Decision copilot** | Click a zone → rules engine classifies severity (normal/watch/alert/critical) and produces a fixed candidate-action set → Gemini writes a 2–3 sentence operator brief explaining what's happening and which action to take first. | Real-time decision support |
| **Multilingual PA composer** | Staff draft one announcement in English once; Gemini translates it into up to 6 languages simultaneously for immediate broadcast. | Multi-language assistance |
| **Incident triage** | Staff type a free-text radio report ("fan collapsed near Section 12"); Gemini returns a structured JSON triage — severity, suggested response unit, first dispatch message. | Real-time decision support |

**Demo flow (also in the LinkedIn/blog post):** a zone's occupancy crosses 90% → the dashboard flags it amber/red in real time → operator clicks it → copilot explains why and recommends opening an auxiliary gate → operator drafts a redirect announcement → it's translated into Hindi, Spanish, and French in one click.

### Architecture

```
frontend/  React (Vite) SPA — dashboard, copilot panel, announcement composer
backend/   Node/Express API
  services/simulator.js       synthetic live signal feed (see Assumptions)
  services/decisionEngine.js  deterministic thresholds + rule-based actions (pure, unit-tested)
  services/geminiClient.js    Gemini API wrapper — narration, translation, triage
  routes/api.js               REST endpoints + per-IP rate limiting
```

No datasets, images, or model weights are stored in the repo — the entire codebase is source files, which keeps it far under the 10 MB limit and keeps the diff genuinely readable.

## 4. Assumptions made

- **No real stadium IoT/CCTV feed was available**, so `backend/services/simulator.js` generates a seeded, bounded random-walk feed standing in for turnstile counters, crowd-density cameras, and queue-timer sensors. This is called out explicitly (not hidden) — swapping `getSnapshot()` for a real ingestion adapter is the only change needed to point this at live sensors; the rules engine and Gemini layer are unchanged.
- Thresholds (75%/90%/100% occupancy, 10/18/28 min queue) are illustrative operational defaults, not FIFA-specified figures, and would be tuned per-venue in a real deployment.
- The app assumes a **staff-only, authenticated context** in production (see Security below) — it is explicitly not a public-facing tool.
- Gemini API key is optional at demo time: if `GEMINI_API_KEY` is unset, every AI-backed feature falls back to a deterministic **mock mode** response so reviewers can run the whole app with zero setup and zero secrets. Mock responses are clearly labeled in the UI.

## 4a. Code quality

- **Zero duplication in the severity logic** — a single `SEVERITY_RANK` constant is the one source of truth for severity ordering, used both to escalate a zone's classification and to sort the dashboard; there used to be two separately-typed-out copies of this map and they've been consolidated.
- **No dynamic imports inside request handlers** — every dependency is imported statically at the top of its module, which is both faster (no per-request module resolution) and easier to read.
- **DRY route handlers** — the three Gemini-backed routes previously repeated the same try/catch/502 boilerplate three times; they now share one `asyncGeminiRoute` wrapper and one `validateShortText` helper, so each route is just its own actual logic.
- **JSDoc types on the domain model** — `ZoneSnapshot`, `ClassifiedZone`, and `CandidateAction` are documented with `@typedef` blocks, giving editor autocomplete/type-checking without a full TypeScript migration.
- **The pure decision-engine core is strict-mode type-checked** — `npm run typecheck` runs TypeScript's checker in `--strict` mode against `decisionEngine.js` (which has zero external dependencies, so this is a clean, honest check rather than one padded out by third-party library noise) and passes with zero errors.
- **ESLint enforced in CI** — `eslint:recommended` plus a few explicit rules (`no-var`, `prefer-const`, `eqeqeq`), zero warnings on the current codebase.
- **Consistent file/module boundaries** — `simulator.js` (data), `decisionEngine.js` (pure logic), `geminiClient.js` (external I/O), `routes/api.js` (wiring) — each file has exactly one job, so a reviewer can predict what's inside before opening it.

## 4b. Problem statement alignment — explicit checklist

| Brief requirement | Where it's addressed |
|---|---|
| GenAI-enabled architecture for venue operations | `backend/services/geminiClient.js` (Gemini narration/translation/triage) layered over `decisionEngine.js` (rules) |
| Dynamic crowd management | Live dashboard (`Dashboard.jsx`), zone occupancy/queue classification (`decisionEngine.js`) |
| Real-time decision support | `/api/decide/:zoneId` — fixed thresholds + Gemini-narrated recommendation |
| Multi-language assistance | `/api/announce` — one draft, up to 6 simultaneous translations |
| Ability to build a smart, dynamic assistant | Copilot panel + incident triage, both context-aware (react to live zone state, not static answers) |
| Logical decision making based on user context | Deterministic severity thresholds drive every recommendation; Gemini never decides severity itself |
| Practical, real-world usability | Staff-facing, not a novelty fan chatbot; mirrors how real venue operations centers already work |
| Clean, maintainable code | See §4a above; ESLint + strict-mode type-checked core + CI, enforced automatically on every push |
| One chosen persona | On-ground staff / control-room operator, stated explicitly in §1 |



- **No secrets in source control** — `.env` files are git-ignored; `.env.example` ships instead. The app is fully functional without any key.
- **Hardened HTTP headers via Helmet** — strict `Content-Security-Policy` (`default-src 'none'`), `X-Frame-Options`, `X-Content-Type-Options: nosniff`, HSTS, and related headers are set on every response.
- **CORS is restricted** to a configured origin allow-list, not `*`.
- **Request bodies are size- and length-capped** (announcement/report text ≤ 500 chars, JSON body ≤ 50kb) to reduce prompt-injection/DoS surface.
- **Rate limiting via `express-rate-limit`** on every Gemini-backed route (20 req/min/IP) protects the API key from abuse and bounds cost, with standard `RateLimit-*` response headers and automatic bucket cleanup (no unbounded memory growth on a long-running process).
- **Errors never leak stack traces** to the client — a generic 500 handler catches unhandled errors server-side.
- **`x-powered-by` header disabled** so the framework/version isn't advertised to clients.
- Intended deployment assumes **staff authentication** (e.g. SSO/role-based access) in front of this API; this repo focuses on the operations-logic layer and leaves auth to the venue's existing identity provider, noted here rather than stubbed insecurely.

## 6. Testing

```bash
cd backend && npm install && npm run lint && npm run typecheck && npm test   # 15 unit tests
cd frontend && npm install && npm test                                       # 8 component tests
```

**Backend** — 15 unit tests across the decision engine (threshold boundaries, incident-forced escalation, snapshot sorting, severity-rank consistency) and the simulator (shape/type guarantees, occupancy/queue bounds held across repeated ticks, zone lookup). Pure-function tests, no network/API dependency.

**Frontend** — 8 component tests (Vitest + React Testing Library): `ZoneCard` rendering, accessible `aria-label`/`aria-pressed` contract, click handling, incident-flag visibility; `Dashboard` rendering zones from a mocked API response and surfacing a connection error accessibly via `role="alert"`.

**CI** — `.github/workflows/ci.yml` runs lint + strict-mode type check + backend tests, and frontend tests + production build, automatically on every push to `main` and every pull request. A green check on the repo is visible proof the app builds and passes tests, not just a claim in this README.

## 6a. Efficiency notes

- **Gzip/deflate compression** on all API responses (`compression` middleware).
- **Short-lived snapshot caching** (1.5s) on `/api/simulate` — concurrent pollers within the same window share one computed snapshot instead of each triggering a fresh simulator tick and serialization pass, well under the 4s client poll interval so the feed still feels live.
- **Memoized `ZoneCard`** (`React.memo` with a targeted comparator) — on each 4s poll, only zones whose own data actually changed re-render; unaffected zones (and their animated pulse-strips) skip re-render entirely.
- **Gemini is only called for zones that cross a threshold** — the rules engine filters first, so routine "normal" zones never generate an LLM call at all, bounding token usage and latency.

## 7. How to run it

**Backend**
```bash
cd backend
npm install
cp .env.example .env   # optional — leave GEMINI_API_KEY blank to run in mock mode
npm start               # http://localhost:8787
```

**Frontend** (separate terminal)
```bash
cd frontend
npm install
cp .env.example .env
npm run dev             # http://localhost:5173
```

Open `http://localhost:5173`. The status pill in the top bar shows whether Gemini is live or running in mock mode.

## 8. Accessibility

- All interactive elements (zone cards, checkboxes, buttons) are real `<button>`/`<input>` elements with visible keyboard focus rings, not click-handlers on generic `<div>`s.
- Zone severity is never conveyed by color alone — every zone also carries a text severity label and an ARIA label summarizing occupancy in words.
- `prefers-reduced-motion` is respected: the pulse-strip animation freezes to a static bar for users who've asked for reduced motion at the OS level.
- Color palette (cyan/amber/red/green) maintains contrast against the dark background well above WCAG AA for body text.

## 9. What we'd do next with more time

- Replace the simulated feed with a real ingestion adapter (turnstile API, CCTV crowd-count model).
- Add authentication/roles so recommendations can be assigned and acknowledged per staff member.
- Persist incident history for post-match operational review.

---

*Built for PromptWars Virtual — Challenge 4 (Smart Stadiums & Tournament Operations) using Google Antigravity.*
