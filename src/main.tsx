import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "../app/globals.css";
import "./fonts.css";
// ponytail: renders the Next page as-is until the Next app is removed (plan step 6)
import Home from "../app/page";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
