import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeChat {
  readonly url: string;
  readonly requests: { path: string; body: any }[];
  close(): Promise<void>;
}

/** An OpenAI-compatible chat endpoint on an ephemeral local port. `reply` returns the status and raw body. */
export async function startFakeChat(
  reply: (body: any) => { status?: number; body: string } = () => ({ body: "{}" }),
): Promise<FakeChat> {
  const requests: { path: string; body: any }[] = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : undefined;
      requests.push({ path: req.url ?? "", body });
      const out = reply(body);
      res.writeHead(out.status ?? 200, { "content-type": "application/json" });
      res.end(out.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export const chatCompletion = (content: string) => JSON.stringify({ choices: [{ message: { content } }] });
