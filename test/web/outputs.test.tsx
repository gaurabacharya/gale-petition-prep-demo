// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldRow } from "../../web/src/api";
import { App } from "../../web/src/App";

const api = vi.hoisted(() => ({
  listCases: vi.fn(),
  createCase: vi.fn(),
  getCase: vi.fn(),
  getChecks: vi.fn(),
  patchField: vi.fn(),
  uploadDocument: vi.fn(),
  generateDataSheet: vi.fn(),
  generateLetter: vi.fn(),
}));
vi.mock("../../web/src/api", () => api);
afterEach(cleanup);

const BANNER =
  "Demo mode: synthetic data only. This build sends text to Claude via the Anthropic API. Real case files would use a self-hosted model.";

const field = (name: string, status: FieldRow["status"]): FieldRow => ({
  id: name,
  docKind: "offer_letter",
  name,
  value: "v",
  quote: "v",
  source: "llm",
  confidence: "high",
  status,
});

const open = (statuses: FieldRow["status"][]) => {
  api.getCase.mockResolvedValue({
    id: "c1",
    label: "L",
    documents: [],
    fields: statuses.map((s, i) => field(`f${i}`, s)),
    answers: {},
  });
  render(
    <MemoryRouter initialEntries={["/case/c1"]}>
      <App />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  api.listCases.mockResolvedValue([]);
  api.getChecks.mockResolvedValue({ checks: [], discrepancies: 0 });
  api.generateDataSheet.mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
  api.generateLetter.mockResolvedValue({ body: "Dear Officer", model: "mock" });
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});

// The banner asks /status which provider is running; offline falls back to the default banner.
vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

describe("outputs on the case review screen", () => {
  it("keeps both buttons disabled while a field is pending", async () => {
    open(["approved", "pending"]);
    await screen.findByText("f0");
    expect((screen.getByRole("button", { name: "Generate petition data" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Draft support letter" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("downloads the data sheet when everything is approved", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    open(["approved", "approved"]);
    await screen.findByText("f0");
    fireEvent.click(screen.getByRole("button", { name: "Generate petition data" }));
    await waitFor(() => expect(api.generateDataSheet).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    click.mockRestore();
  });

  it("shows the letter draft in an editable textbox", async () => {
    open(["approved"]);
    await screen.findByText("f0");
    fireEvent.click(screen.getByRole("button", { name: "Draft support letter" }));
    const box = (await screen.findByLabelText("Support letter draft")) as HTMLTextAreaElement;
    expect(box.value).toBe("Dear Officer");
    fireEvent.change(box, { target: { value: "Edited" } });
    expect(box.value).toBe("Edited");
  });

  it("shows the server's message when generation is rejected", async () => {
    api.generateLetter.mockRejectedValue(new Error("Outputs are blocked: 1 field(s) are not approved yet."));
    open(["approved"]);
    await screen.findByText("f0");
    fireEvent.click(screen.getByRole("button", { name: "Draft support letter" }));
    expect(await screen.findByText(/Outputs are blocked/)).toBeTruthy();
  });
});

describe("demo banner", () => {
  it("shows on the queue and the case review", async () => {
    render(
      <MemoryRouter initialEntries={["/queue"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText(BANNER)).toBeTruthy();
    cleanup();
    open(["approved"]);
    expect(await screen.findByText(BANNER)).toBeTruthy();
  });
});
