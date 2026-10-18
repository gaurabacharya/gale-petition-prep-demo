import { Route, Routes } from "react-router-dom";
import { Nav } from "./components/Nav";
import { CaseReview } from "./pages/CaseReview";
import { ReviewQueue } from "./pages/ReviewQueue";

export function App() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-[1300px] px-6 py-8">
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Demo mode: synthetic data only. This build sends text to Claude via the Anthropic API. Real case files would
          use a self-hosted model.
        </div>
        <Routes>
          <Route path="/" element={<ReviewQueue filter="all" />} />
          <Route path="/queue" element={<ReviewQueue filter="queue" />} />
          <Route path="/case/:id" element={<CaseReview />} />
        </Routes>
      </main>
    </>
  );
}
