// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Check, FieldRow } from "../../web/src/api";
import { CaseReview } from "../../web/src/pages/CaseReview";

const store = vi.hoisted(() => ({ fields: [] as FieldRow[], checks: [] as Check[] }));
const api = vi.hoisted(() => ({
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

const field = (name: string, value: string, over: Partial<FieldRow> = {}): FieldRow => ({
  id: name,
  docKind: "offer_letter",
  name,
  value,
  quote: `quote of ${value}`,
  source: "llm",
  confidence: "high",
  status: "pending",
  ...over,
});

// The walkthrough loads the sample PNG and PDFs from /samples, so serve small stand-ins.
const stubSamples = () =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["sample"]), { status: 200 })));

beforeEach(() => {
  stubSamples();
  store.fields = [field("employer", "Utopia"), field("job_title", "Engineer"), field("annual_salary", "negotiable")];
  store.checks = [
    { id: "salary", level: "problem", message: "The offer letter has no usable annual salary.", fieldRefs: [{ docKind: "offer_letter", name: "annual_salary" }] },
    { id: "prevailing_wage", level: "for_attorney", message: "Compare the salary to the prevailing wage.", fieldRefs: [] },
  ];
  api.getCase.mockImplementation(async () => ({
    id: "c1",
    label: "Doe H-1B",
    documents: [{ kind: "offer_letter", filename: "offer.txt" }],
    fields: store.fields,
    answers: { "offer_letter.job_title": "Software Engineer" },
  }));
  api.getChecks.mockImplementation(async () => ({ checks: store.checks, discrepancies: 1 }));
  api.patchField.mockImplementation(async (id: string, patch: { value?: string; status?: "pending" | "approved" }) => {
    store.fields = store.fields.map((x) =>
      x.id !== id
        ? x
        : {
            ...x,
            value: patch.value ?? x.value,
            source: patch.value !== undefined ? "attorney" : x.source,
            status: patch.status ?? (patch.value !== undefined ? "pending" : x.status),
          },
    );
    return store.fields.find((x) => x.id === id);
  });
  api.uploadDocument.mockImplementation(async () => {
    store.fields = store.fields.map((x) => ({ ...x, status: "pending" as const }));
  });
});

const show = async () => {
  render(
    <MemoryRouter initialEntries={["/case/c1"]}>
      <Routes>
        <Route path="/case/:id" element={<CaseReview />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText("annual_salary");
};
const rowOf = (name: string) => screen.getByText(name).closest("tr")!;

describe("CaseReview", () => {
  it("sorts discrepancy rows first and marks them red", async () => {
    await show();
    const names = screen.getAllByTestId("fact-name").map((n) => n.textContent);
    expect(names[0]).toBe("annual_salary");
    expect(rowOf("annual_salary").className).toContain("red");
  });

  it("shows check messages in the checks card", async () => {
    await show();
    expect(screen.getByText("The offer letter has no usable annual salary.")).toBeTruthy();
    expect(screen.getByText("Compare the salary to the prevailing wage.")).toBeTruthy();
  });

  it("saves an edit with Save & accept, marking it attorney-sourced and approved", async () => {
    await show();
    fireEvent.click(within(rowOf("job_title")).getByRole("button", { name: "Edit job_title" }));
    fireEvent.change(screen.getByLabelText("Value for job_title"), { target: { value: "Senior Engineer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save & accept" }));
    await waitFor(() =>
      expect(api.patchField).toHaveBeenCalledWith("job_title", { value: "Senior Engineer", status: "approved" }),
    );
    await waitFor(() => expect(within(rowOf("job_title")).getByText("attorney")).toBeTruthy());
    expect(within(rowOf("job_title")).getByText("Approved")).toBeTruthy();
  });

  it("saves an edit with Enter and cancels with Escape", async () => {
    api.patchField.mockClear();
    await show();
    fireEvent.click(within(rowOf("employer")).getByRole("button", { name: "Edit employer" }));
    fireEvent.keyDown(screen.getByLabelText("Value for employer"), { key: "Escape" });
    expect(screen.queryByLabelText("Value for employer")).toBeNull();
    expect(api.patchField).not.toHaveBeenCalled();
    fireEvent.click(within(rowOf("employer")).getByRole("button", { name: "Edit employer" }));
    const input = screen.getByLabelText("Value for employer");
    fireEvent.change(input, { target: { value: "Utopia Inc." } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(api.patchField).toHaveBeenCalledWith("employer", { value: "Utopia Inc.", status: "approved" }));
    await waitFor(() => expect(screen.queryByLabelText("Value for employer")).toBeNull());
  });

  it("disables Accept while its request is saving", async () => {
    let release!: () => void;
    const original = api.patchField.getMockImplementation()!;
    api.patchField.mockImplementationOnce(async (...args: Parameters<typeof original>) => {
      await new Promise<void>((r) => (release = r));
      return original(...args);
    });
    await show();
    fireEvent.click(within(rowOf("employer")).getByRole("button", { name: "Accept document value for employer" }));
    const busy = within(rowOf("employer")).getByRole("button", { name: "Accept document value for employer" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.textContent).toBe("Saving…");
    release();
    await waitFor(() => expect(within(rowOf("employer")).getByText("Approved")).toBeTruthy());
  });

  it("shows the questionnaire side as Accepted once the matching value is approved", async () => {
    store.fields = store.fields.map((x) =>
      x.name === "job_title" ? { ...x, value: "Software Engineer", status: "approved" as const } : x,
    );
    await show();
    expect(within(rowOf("job_title")).getByText("Accepted")).toBeTruthy();
    expect(within(rowOf("job_title")).queryByRole("button", { name: "Accept questionnaire answer for job_title" })).toBeNull();
  });

  it("explains an approved row that still has a warning or a problem", async () => {
    store.fields = store.fields.map((x) => ({ ...x, status: "approved" as const }));
    store.checks = [
      ...store.checks,
      { id: "w", level: "warning", message: "Employer warning.", fieldRefs: [{ docKind: "offer_letter", name: "employer" }] },
    ];
    await show();
    expect(within(rowOf("employer")).getByText("Reviewed with warning")).toBeTruthy();
    expect(rowOf("employer").className).not.toContain("bg-amber-50");
    expect(within(rowOf("annual_salary")).getByText(/check still fails/)).toBeTruthy();
  });

  it("keeps the row order when an accept clears a check", async () => {
    await show();
    const before = screen.getAllByTestId("fact-name").map((n) => n.textContent);
    store.checks = store.checks.filter((c) => c.level !== "problem");
    fireEvent.click(within(rowOf("annual_salary")).getByRole("button", { name: "Accept document value for annual_salary" }));
    await waitFor(() => expect(within(rowOf("annual_salary")).getByText("Approved")).toBeTruthy());
    expect(screen.getAllByTestId("fact-name").map((n) => n.textContent)).toEqual(before);
  });

  it("approves a field with Accept", async () => {
    await show();
    fireEvent.click(within(rowOf("employer")).getByRole("button", { name: "Accept document value for employer" }));
    await waitFor(() => expect(api.patchField).toHaveBeenCalledWith("employer", { status: "approved" }));
  });

  it("accepts the questionnaire answer by writing it and approving", async () => {
    await show();
    fireEvent.click(within(rowOf("job_title")).getByRole("button", { name: "Accept questionnaire answer for job_title" }));
    await waitFor(() =>
      expect(api.patchField).toHaveBeenCalledWith("job_title", { value: "Software Engineer", status: "approved" }),
    );
  });

  it("shows Ready to file only once every field is approved and no problem remains", async () => {
    api.generateDataSheet.mockResolvedValue(new Blob(["%PDF"]));
    api.getLetter.mockResolvedValue(undefined);
    URL.createObjectURL = vi.fn(() => "about:blank");
    URL.revokeObjectURL = vi.fn();
    await show();
    expect(screen.queryByRole("region", { name: "Ready to file" })).toBeNull();
    for (const name of ["employer", "job_title", "annual_salary"]) {
      fireEvent.click(within(rowOf(name)).getByRole("button", { name: `Accept document value for ${name}` }));
      await waitFor(() => expect(within(rowOf(name)).getByText("Approved")).toBeTruthy());
    }
    // The salary problem still blocks outputs.
    expect(screen.queryByRole("region", { name: "Ready to file" })).toBeNull();
    fireEvent.click(within(rowOf("annual_salary")).getByRole("button", { name: "Edit annual_salary" }));
    fireEvent.change(screen.getByLabelText("Value for annual_salary"), { target: { value: "$95,000" } });
    store.checks = store.checks.filter((c) => c.level !== "problem");
    fireEvent.click(screen.getByRole("button", { name: "Save & accept" }));
    expect(await screen.findByRole("region", { name: "Ready to file" })).toBeTruthy();
  });

  it("re-fetches after an upload so approvals reset", async () => {
    store.fields = store.fields.map((x) => ({ ...x, status: "approved" as const }));
    await show();
    expect(within(rowOf("employer")).getByText("Approved")).toBeTruthy();
    const before = api.getCase.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Upload offer_letter"), {
      target: { files: [new File(["x"], "offer.txt", { type: "text/plain" })] },
    });
    await waitFor(() => expect(api.getCase.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(within(rowOf("employer")).queryByText("Approved")).toBeNull());
    expect(screen.queryByRole("region", { name: "Ready to file" })).toBeNull();
  });

  const open = async (path = "/case/c1") => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/case/:id" element={<CaseReview />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("annual_salary");
  };

  it("opens the Add documents dialog right after a case is created, with the examples hidden", async () => {
    await open("/case/c1?new=1");
    const dialog = screen.getByRole("dialog", { name: "Add documents" });
    expect(within(dialog).queryByRole("button", { name: "Add Passport" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: /Fill example/ }));
    // The fixture case already has its offer letter, so that card says Added instead of offering Add.
    for (const t of ["Passport", "Degree"]) {
      expect(within(dialog).getByRole("button", { name: `Add ${t}` })).toBeTruthy();
    }
    expect(within(dialog).getByText("Added")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "View Offer letter" })).toBeTruthy();
  });

  it("stays closed on a normal visit and reopens with the Add documents button", async () => {
    await show();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add documents" }));
    expect(screen.getByRole("dialog", { name: "Add documents" })).toBeTruthy();
  });

  it("Add processes one document at a time and shows the OCR stage for the passport", async () => {
    api.uploadDocument.mockClear();
    await open("/case/c1?new=1");
    fireEvent.click(screen.getByRole("button", { name: /Fill example/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add Passport" }));
    await screen.findByText(/Processing passport/);
    expect(screen.getByText("Running OCR on the passport scan")).toBeTruthy();
    expect(screen.getByText("Parsing the machine-readable zone locally")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add Degree" }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(api.uploadDocument).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(api.uploadDocument.mock.calls[0][1]).toBe("passport");
    expect(api.uploadDocument.mock.calls[0][2].name).toBe("passport.png");
    await waitFor(() => expect(screen.queryByText(/Processing passport/)).toBeNull(), { timeout: 5000 });
  }, 10000);

  it("accepts a sample document dragged onto the drop area", async () => {
    api.uploadDocument.mockClear();
    await open("/case/c1?new=1");
    fireEvent.drop(screen.getByTestId("drop-zone"), { dataTransfer: { getData: () => "degree", files: [] } });
    await waitFor(() => expect(api.uploadDocument).toHaveBeenCalledTimes(1), { timeout: 6000 });
    expect(api.uploadDocument.mock.calls[0][1]).toBe("degree");
    expect(api.uploadDocument.mock.calls[0][2].name).toBe("degree.pdf");
    expect(api.uploadDocument.mock.calls[0][2].type).toBe("application/pdf");
  }, 10000);

  it("takes a real file dropped from the desktop as the next document still needed", async () => {
    api.uploadDocument.mockClear();
    await open("/case/c1?new=1");
    const file = new File(["x"], "my-passport.png", { type: "image/png" });
    fireEvent.drop(screen.getByTestId("drop-zone"), { dataTransfer: { getData: () => "", files: [file] } });
    await waitFor(() => expect(api.uploadDocument).toHaveBeenCalledTimes(1), { timeout: 6000 });
    expect(api.uploadDocument.mock.calls[0][1]).toBe("passport");
    expect(api.uploadDocument.mock.calls[0][2]).toBe(file);
  }, 10000);

  it("lets the user view each example document before adding it", async () => {
    await open("/case/c1?new=1");
    fireEvent.click(screen.getByRole("button", { name: /Fill example/ }));
    fireEvent.click(screen.getByRole("button", { name: "View Passport" }));
    const preview = screen.getByRole("dialog", { name: "Preview of Passport" });
    expect((within(preview).getByAltText("Passport") as HTMLImageElement).getAttribute("src")).toBe("/samples/passport.png");
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(screen.queryByRole("dialog", { name: "Preview of Passport" })).toBeNull();
    // Escape closes only the preview, leaving the Add documents dialog open.
    fireEvent.click(screen.getByRole("button", { name: "View Offer letter" }));
    expect(screen.getByTitle("Offer letter").getAttribute("src")).toBe("/samples/offer-letter.pdf");
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Preview of Offer letter" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Preview of Offer letter" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Add documents" })).toBeTruthy();
  });

  it("offers Review facts once all three documents are in, and it closes the dialog", async () => {
    api.getCase.mockImplementation(async () => ({
      id: "c1",
      label: "Doe H-1B",
      documents: ["passport", "degree", "offer_letter"].map((kind) => ({ kind, filename: `${kind}.x` })),
      fields: store.fields,
      answers: {},
    }));
    await open("/case/c1?new=1");
    fireEvent.click(screen.getByRole("button", { name: "Review facts" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
