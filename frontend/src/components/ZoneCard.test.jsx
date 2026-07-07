import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ZoneCard from "./ZoneCard.jsx";

function makeZone(overrides = {}) {
  return {
    id: "gate-a",
    label: "Gate A - Main Concourse",
    severity: "normal",
    occupancyRatio: 0.42,
    queueMinutes: 5,
    trend: "stable",
    incident: null,
    ...overrides,
  };
}

describe("ZoneCard", () => {
  it("renders the zone label and occupancy percentage", () => {
    render(<ZoneCard zone={makeZone()} selected={false} onSelect={() => {}} />);
    expect(screen.getByText("Gate A - Main Concourse")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("exposes an accessible label summarizing severity and occupancy for screen readers", () => {
    render(<ZoneCard zone={makeZone({ severity: "alert", occupancyRatio: 0.91 })} selected={false} onSelect={() => {}} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute(
      "aria-label",
      expect.stringContaining("severity alert")
    );
    expect(button.getAttribute("aria-label")).toContain("91 percent");
  });

  it("calls onSelect with the zone id when clicked", () => {
    const onSelect = vi.fn();
    render(<ZoneCard zone={makeZone()} selected={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("gate-a");
  });

  it("reflects selection state via aria-pressed, not color alone", () => {
    render(<ZoneCard zone={makeZone()} selected={true} onSelect={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("surfaces an active incident as visible text", () => {
    render(
      <ZoneCard
        zone={makeZone({ incident: "Medical assistance requested" })}
        selected={false}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText(/Medical assistance requested/)).toBeInTheDocument();
  });

  it("does not render an incident flag when there is no active incident", () => {
    render(<ZoneCard zone={makeZone()} selected={false} onSelect={() => {}} />);
    expect(screen.queryByText(/⚠/)).not.toBeInTheDocument();
  });
});
