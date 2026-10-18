import { Layer } from "effect";
import { makeMemoryAuditLog } from "../../src/audit/audit";
import { makeLlmClientLayer } from "../../src/llm/LlmClient";
import { makeMockProvider, type MockCall } from "../../src/llm/mock";

/** A mock-backed LlmClient plus an in-memory AuditLog, merged so tests can provide both. */
export function makeTestLlm(respond: (call: MockCall) => string | object) {
  const mock = makeMockProvider(respond);
  const audit = makeMemoryAuditLog();
  const layer = Layer.merge(audit.layer, makeLlmClientLayer(mock.provider).pipe(Layer.provide(audit.layer)));
  return { layer, calls: mock.calls, entries: audit.entries };
}

const x = (value: string, quote = value) => ({ value, quote });

export const DEGREE_RESPONSE = {
  name: x("Anna Eriksson"),
  degree: x("Bachelor of Science", "Bachelor of Science in Computer Science"),
  field_of_study: x("Computer Science", "Bachelor of Science in Computer Science"),
  institution: x("Utopia University", "UTOPIA UNIVERSITY"),
  date_conferred: x("May 20, 2012", "Conferred on May 20, 2012"),
};

export const OFFER_RESPONSE = {
  name: x("Anna Eriksson", "Dear Anna Eriksson"),
  job_title: x("Software Engineer", "the position of Software Engineer"),
  duties: x("designing and building backend services"),
  annual_salary: x("$95,000", "Your annual salary will be $95,000"),
  start_date: x("October 1, 2026", "Your start date will be October 1, 2026"),
  employer: x("Utopia Technologies Inc."),
  worksite_location: x("100 Main Street, Springfield", "Your worksite will be 100 Main Street, Springfield"),
};

/** Only the degree prompt lists `field_of_study`. */
export const respondByDocument = (call: MockCall) =>
  call.prompt.includes("field_of_study") ? DEGREE_RESPONSE : OFFER_RESPONSE;
