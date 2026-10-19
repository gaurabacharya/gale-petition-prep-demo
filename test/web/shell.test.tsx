// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "../../web/src/App";
import { StatusPill } from "../../web/src/components/StatusPill";

vi.mock("../../web/src/api", () => ({ listCases: vi.fn().mockResolvedValue([]) }));

// The banner asks /status which provider is running; offline falls back to the default banner.
vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

describe("shell", () => {
  it("shows the brand and nav links", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText("Petition Prep")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cases" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review queue" })).toBeTruthy();
  });

  it("colours pills amber for needs review and red for discrepancy", () => {
    const { rerender } = render(<StatusPill status="needs_review" />);
    expect(screen.getByText("Needs review").className).toContain("amber");
    rerender(<StatusPill status="discrepancy" />);
    expect(screen.getByText("Discrepancy").className).toContain("red");
  });
});
