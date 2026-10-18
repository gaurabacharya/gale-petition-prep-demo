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

beforeEach(() => {
  store.fields = [field("employer", "Utopia"), field("job_title", "Engineer"), field("annual_salary", "negotiable")];
  store.checks = [
    { id: "salary", level: "problem", message: "The offer letter has no usable annual salary.", fieldRefs: [{ docKind: "offer_letter", name: "annual_salary" }] },
    { id: "prevailing_wage", level: "for_attorney", message: "Compare the salary to the prevailing wage.", fieldRefs: [] },
  ];
  api.getCase.mockImplementation(async () => ({
    id: "c1",
    label: "Eriksson H-1B",
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

  it("marks an edit as attorney-sourced and pending", async () => {
    await show();
    fireEvent.click(within(rowOf("job_title")).getByRole("button", { name: "Edit job_title" }));
    fireEvent.change(screen.getByLabelText("Value for job_title"), { target: { value: "Senior Engineer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.patchField).toHaveBeenCalledWith("job_title", { value: "Senior Engineer" }));
    await waitFor(() => expect(within(rowOf("job_title")).getByText("attorney")).toBeTruthy());
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

  it("unlocks Generate petition data only when every field is approved", async () => {
    await show();
    const button = screen.getByRole("button", { name: "Generate petition data" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    for (const name of ["employer", "job_title", "annual_salary"]) {
      fireEvent.click(within(rowOf(name)).getByRole("button", { name: `Accept document value for ${name}` }));
      await waitFor(() => expect(within(rowOf(name)).getByText("Approved")).toBeTruthy());
    }
    await waitFor(() => expect(button.disabled).toBe(false));
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
    expect((screen.getByRole("button", { name: "Generate petition data" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
