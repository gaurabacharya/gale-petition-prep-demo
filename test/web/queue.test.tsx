// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaseSummary } from "../../web/src/api";
import { ReviewQueue } from "../../web/src/pages/ReviewQueue";

const listCases = vi.hoisted(() => vi.fn());
const createCase = vi.hoisted(() => vi.fn());
vi.mock("../../web/src/api", () => ({ listCases, createCase }));
afterEach(cleanup);

const LocationProbe = () => {
  const l = useLocation();
  return <p>{l.pathname + l.search}</p>;
};

const row = (over: Partial<CaseSummary> = {}): CaseSummary => ({
  id: "c1",
  label: "Doe H-1B",
  beneficiary: "JOHN MICHAEL DOE",
  employer: "Utopia Technologies Inc.",
  status: "needs_review",
  documents: 3,
  lowConfidence: 0,
  caseType: "lottery",
  employerQuestionnaire: "Approved",
  beneficiaryQuestionnaire: "Pending",
  discrepancies: 2,
  problems: 0,
  ...over,
});

const show = async (filter: "all" | "queue") => {
  render(
    <MemoryRouter>
      <ReviewQueue filter={filter} />
    </MemoryRouter>,
  );
};

describe("ReviewQueue", () => {
  it("renders the spec columns", async () => {
    listCases.mockResolvedValue([row()]);
    await show("all");
    await screen.findByText("JOHN MICHAEL DOE");
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual([
      "Beneficiary",
      "Case type",
      "Case status",
      "Employer questionnaire",
      "Beneficiary questionnaire",
      "Documents",
      "Discrepancies",
      "Actions",
    ]);
  });

  it("shows the employer under the name, the count, and a link to the case", async () => {
    listCases.mockResolvedValue([row({ status: "discrepancy", discrepancies: 3 })]);
    await show("all");
    const r = (await screen.findByText("JOHN MICHAEL DOE")).closest("tr")!;
    expect(within(r).getByText("Utopia Technologies Inc.")).toBeTruthy();
    expect(within(r).getByText("3")).toBeTruthy();
    expect(within(r).getByText("Discrepancy").className).toContain("red");
    expect(within(r).getByRole("link", { name: /Review case/ }).getAttribute("href")).toBe("/case/c1");
  });

  it("hides ready cases in the review queue but not in all cases", async () => {
    listCases.mockResolvedValue([row({ id: "r", beneficiary: "READY PERSON", status: "ready" })]);
    await show("queue");
    await screen.findByText(/No cases/);
    expect(screen.queryByText("READY PERSON")).toBeNull();
    cleanup();
    await show("all");
    expect(await screen.findByText("READY PERSON")).toBeTruthy();
  });

  it("+ New case opens a dialog; Create makes the case and opens it with the Add documents dialog flag", async () => {
    listCases.mockResolvedValue([]);
    createCase.mockResolvedValue({ id: "new1", label: "Doe H-1B" });
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<ReviewQueue filter="all" />} />
          <Route path="/case/:id" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: /Fill in demo info/ })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /New case/ }));
    const dialog = screen.getByRole("dialog", { name: "New case" });
    const create = within(dialog).getByRole("button", { name: "Create case" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Case label"), { target: { value: "Doe H-1B" } });
    fireEvent.click(create);
    expect(await screen.findByText("/case/new1?new=1")).toBeTruthy();
    expect(createCase).toHaveBeenCalledWith("Doe H-1B");
  });

  it("puts the cursor in the Case label field when the dialog opens", async () => {
    listCases.mockResolvedValue([]);
    await show("all");
    fireEvent.click(await screen.findByRole("button", { name: /New case/ }));
    expect(document.activeElement).toBe(screen.getByLabelText("Case label"));
  });

  it("shows the error in the dialog when creating the case fails", async () => {
    listCases.mockResolvedValue([]);
    createCase.mockRejectedValue(new Error("database unavailable"));
    await show("all");
    fireEvent.click(await screen.findByRole("button", { name: /New case/ }));
    fireEvent.change(screen.getByLabelText("Case label"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "Create case" }));
    await screen.findByText("database unavailable");
    expect(screen.getByRole("dialog", { name: "New case" })).toBeTruthy();
  });

  it("Cancel closes the dialog without creating anything", async () => {
    listCases.mockResolvedValue([]);
    createCase.mockClear();
    await show("all");
    fireEvent.click(await screen.findByRole("button", { name: /New case/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(createCase).not.toHaveBeenCalled();
  });
});
