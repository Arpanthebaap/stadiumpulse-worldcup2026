import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Dashboard from "./Dashboard.jsx";
import * as api from "../api.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const sampleZones = [
  {
    id: "gate-a",
    label: "Gate A - Main Concourse",
    severity: "normal",
    occupancyRatio: 0.4,
    queueMinutes: 3,
    trend: "stable",
    incident: null,
  },
  {
    id: "gate-b",
    label: "Gate B - North Stand",
    severity: "alert",
    occupancyRatio: 0.93,
    queueMinutes: 20,
    trend: "rising",
    incident: null,
  },
];

describe("Dashboard", () => {
  it("renders a zone card for every zone returned by the API", async () => {
    vi.spyOn(api, "getSnapshot").mockResolvedValue({ zones: sampleZones });
    render(<Dashboard selectedZoneId={null} onSelectZone={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Gate A - Main Concourse")).toBeInTheDocument();
      expect(screen.getByText("Gate B - North Stand")).toBeInTheDocument();
    });
  });

  it("shows a clear, accessible error when the backend is unreachable", async () => {
    vi.spyOn(api, "getSnapshot").mockRejectedValue(new Error("Failed to fetch"));
    render(<Dashboard selectedZoneId={null} onSelectZone={() => {}} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Failed to fetch/);
  });
});
