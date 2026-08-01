import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted variable fonts: one file each, no request to Google, and no
// flash of a fallback face on a slow connection.
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/inter";
import { App } from "./App";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
