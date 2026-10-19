import { createContext } from "react";

/** "replay" when the server plays back recorded model answers instead of calling a model. */
export const ModelModeContext = createContext<"live" | "replay">("live");
