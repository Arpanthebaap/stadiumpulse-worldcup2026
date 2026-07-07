import React, { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard.jsx";
import CopilotPanel from "./components/CopilotPanel.jsx";
import AnnouncementComposer from "./components/AnnouncementComposer.jsx";
import { getStatus } from "./api.js";

export default function App() {
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [geminiLive, setGeminiLive] = useState(null);

  useEffect(() => {
    getStatus()
      .then((s) => setGeminiLive(s.geminiLive))
      .catch(() => setGeminiLive(false));
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <div className="brand-name">StadiumPulse</div>
            <div className="brand-sub">FIFA World Cup 2026 · Ops Copilot</div>
          </div>
        </div>
        <div className={`status-pill`}>
          <span className={`status-dot${geminiLive ? "" : " mock"}`} />
          {geminiLive === null ? "Checking backend…" : geminiLive ? "Gemini live" : "Mock mode (no API key)"}
        </div>
      </header>

      <main className="layout">
        <section className="column">
          <Dashboard selectedZoneId={selectedZoneId} onSelectZone={setSelectedZoneId} />
          <AnnouncementComposer />
        </section>
        <section className="column">
          <CopilotPanel selectedZoneId={selectedZoneId} />
        </section>
      </main>
    </div>
  );
}
