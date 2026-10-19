import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { IN_BROWSER } from "./lib/browserDemo";
import { ModelModeContext } from "./lib/mode";
import { Nav } from "./components/Nav";
import { CaseReview } from "./pages/CaseReview";
import { ReviewQueue } from "./pages/ReviewQueue";

const LIVE_BANNER =
  "Demo mode: synthetic data only. This build sends text to Claude via the Anthropic API. Real case files would use a self-hosted model.";
const REPLAY_BANNER =
  "Demo mode: synthetic data only. Model answers for the John Doe documents were recorded from Claude and are replayed here, so no live model call is made. Everything else (passport parsing, redaction, checks, approval gate) runs for real. Real case files would use a self-hosted model.";

const BROWSER_NOTE =
  " This copy runs entirely in your browser: your cases are stored only on this device, and nothing is sent to a server.";

export function App() {
  const [banner, setBanner] = useState(LIVE_BANNER);
  const [mode, setMode] = useState<"live" | "replay">("live");
  useEffect(() => {
    fetch("/status")
      .then((r) => (r.ok ? (r.json() as Promise<{ model?: string }>) : undefined))
      .then((s) => {
        if (s?.model?.startsWith("replay:")) {
          setBanner(REPLAY_BANNER);
          setMode("replay");
        }
      })
      .catch(() => {});
  }, []);
  return (
    <ModelModeContext.Provider value={mode}>
      <Nav />
      <main className="mx-auto max-w-[1300px] px-6 py-8">
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {banner}
          {IN_BROWSER && BROWSER_NOTE}
        </div>
        <Routes>
          <Route path="/" element={<ReviewQueue filter="all" />} />
          <Route path="/queue" element={<ReviewQueue filter="queue" />} />
          <Route path="/case/:id" element={<CaseReview />} />
        </Routes>
      </main>
    </ModelModeContext.Provider>
  );
}
