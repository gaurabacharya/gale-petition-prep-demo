import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { IN_BROWSER, ResetDemoContext } from "./lib/browserDemo";
import "./index.css";

async function start() {
  let reset: (() => Promise<void>) | undefined;
  if (IN_BROWSER) {
    // GitHub Pages build: run the API in this page, with the database stored in this browser.
    const { startInPageApi, resetBrowserDb } = await import("../../src/browser/inPageApi");
    const { db } = await startInPageApi();
    reset = () => resetBrowserDb(db);
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ResetDemoContext.Provider value={reset}>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
          <App />
        </BrowserRouter>
      </ResetDemoContext.Provider>
    </StrictMode>,
  );
}

void start();
