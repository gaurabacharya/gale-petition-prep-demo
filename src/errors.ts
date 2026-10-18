import { Data } from "effect";

export class UnreadableDocumentError extends Data.TaggedError("UnreadableDocumentError")<{
  readonly message: string;
}> {}

export class DemoModeRejectedError extends Data.TaggedError("DemoModeRejectedError")<{
  readonly message: string;
}> {}

export class OutputsBlockedError extends Data.TaggedError("OutputsBlockedError")<{
  readonly message: string;
  readonly pending: number;
  readonly problems: readonly string[];
}> {}
