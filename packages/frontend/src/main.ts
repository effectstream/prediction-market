import "./style.css";
import { App } from "./App.ts";

// Start application when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => new App());
} else {
  new App();
}
