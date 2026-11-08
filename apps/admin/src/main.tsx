import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { ToastProvider } from "./kit";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// The panel follows the system theme; there is no toggle to keep it simple.
const media = window.matchMedia("(prefers-color-scheme: light)");
const paint = () => {
  document.documentElement.dataset.theme = media.matches ? "light" : "dark";
};
paint();
media.addEventListener("change", paint);

createRoot(root).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
