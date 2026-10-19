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
  getLetter: vi.fn(),
  saveLetter: vi.fn(),
  letterPdf: vi.fn(),
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
  for (const fn of Object.values(api)) fn.mockReset();
  api.listCases.mockResolvedValue([]);
  api.getChecks.mockResolvedValue({ checks: [], discrepancies: 0 });
  api.generateDataSheet.mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
  api.generateLetter.mockResolvedValue({ body: "Dear Officer", model: "mock" });
  api.getLetter.mockResolvedValue(undefined);
  api.saveLetter.mockImplementation(async (_id: string, body: string) => ({ body, model: "mock" }));
  api.letterPdf.mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
  URL.createObjectURL = vi.fn(() => "about:blank");
  URL.revokeObjectURL = vi.fn();
});

// The banner asks /status which provider is running; offline falls back to the default banner.
vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

describe("outputs on the case review screen", () => {
  it("hides the Ready to file panel while a field is pending, and says what is left", async () => {
    open(["approved", "pending"]);
    await screen.findByText("f0");
    expect(screen.queryByRole("region", { name: "Ready to file" })).toBeNull();
    expect(screen.getByTestId("not-ready").textContent).toContain("1 fact to accept");
  });

  it("stays locked when every fact is approved but a problem remains", async () => {
    api.getChecks.mockResolvedValue({
      checks: [{ id: "salary", level: "problem", message: "No salary.", fieldRefs: [] }],
      discrepancies: 1,
    });
    open(["approved", "approved"]);
    await screen.findByText("f0");
    expect(screen.queryByRole("region", { name: "Ready to file" })).toBeNull();
    expect(screen.getByTestId("not-ready").textContent).toContain("1 problem to fix");
  });

  it("previews and downloads the petition data PDF when everything is approved", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    open(["approved", "approved"]);
    await screen.findByRole("region", { name: "Ready to file" });
    await waitFor(() => expect(api.generateDataSheet).toHaveBeenCalledWith("c1"));
    expect(await screen.findByTitle("Petition data preview")).toBeTruthy();
    const download = screen.getByRole("button", { name: "Download petition data PDF" }) as HTMLButtonElement;
    await waitFor(() => expect(download.disabled).toBe(false));
    fireEvent.click(download);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("drafts the letter, shows it in a text box and a PDF preview, and re-renders after an edit", async () => {
    open(["approved"]);
    fireEvent.click(await screen.findByRole("button", { name: "Draft support letter" }));
    const box = (await screen.findByLabelText("Support letter text")) as HTMLTextAreaElement;
    expect(box.value).toBe("Dear Officer");
    await waitFor(() => expect(api.letterPdf).toHaveBeenCalledWith("c1", "Dear Officer"));
    expect(await screen.findByTitle("Support letter preview")).toBeTruthy();
    fireEvent.change(box, { target: { value: "Edited" } });
    await waitFor(() => expect(api.saveLetter).toHaveBeenCalledWith("c1", "Edited"), { timeout: 2000 });
    expect(api.letterPdf).toHaveBeenCalledWith("c1", "Edited");
    expect((screen.getByRole("button", { name: "Download support letter PDF" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("loads a saved draft instead of asking to draft again", async () => {
    api.getLetter.mockResolvedValue({ body: "Saved draft", model: "mock" });
    open(["approved"]);
    const box = (await screen.findByLabelText("Support letter text")) as HTMLTextAreaElement;
    expect(box.value).toBe("Saved draft");
    expect(screen.queryByRole("button", { name: "Draft support letter" })).toBeNull();
  });

  it("asks for a second click before Regenerate replaces edits", async () => {
    api.getLetter.mockResolvedValue({ body: "Saved draft", model: "mock" });
    open(["approved"]);
    await screen.findByLabelText("Support letter text");
    fireEvent.click(screen.getByRole("button", { name: /Regenerate/ }));
    expect(api.generateLetter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Replace my edits/ }));
    await waitFor(() => expect(api.generateLetter).toHaveBeenCalledWith("c1"));
  });

  it("shows the server's message when generation is rejected", async () => {
    api.generateLetter.mockRejectedValue(new Error("Outputs are blocked: 1 field(s) are not approved yet."));
    open(["approved"]);
    fireEvent.click(await screen.findByRole("button", { name: "Draft support letter" }));
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
