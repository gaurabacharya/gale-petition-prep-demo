import { createContext } from "react";

/** Set in the GitHub Pages build, where the API runs inside the page. */
export const IN_BROWSER = import.meta.env.VITE_IN_BROWSER === "true";

/** Empties this browser's demo cases; undefined outside the in-browser build. */
export const ResetDemoContext = createContext<(() => Promise<void>) | undefined>(undefined);
