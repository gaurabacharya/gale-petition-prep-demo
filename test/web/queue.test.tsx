// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaseSummary } from "../../web/src/api";
import { ReviewQueue } from "../../web/src/pages/ReviewQueue";

const listCases = vi.hoisted(() => vi.fn());
vi.mock("../../web/src/api", () => ({ listCases, createCase: vi.fn() }));
afterEach(cleanup);

const row = (over: Partial<CaseSummary> = {}): CaseSummary => ({
  id: "c1",
  label: "Eriksson H-1B",
  beneficiary: "ANNA MARIA ERIKSSON",
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
    await screen.findByText("ANNA MARIA ERIKSSON");
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
    const r = (await screen.findByText("ANNA MARIA ERIKSSON")).closest("tr")!;
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
});
