import "./style.css";
import { App } from "./App.ts";

function boot() {
  const params = new URLSearchParams(window.location.search);

  // Discord OAuth callback — show a success toast then clean the URL
  if (params.get("discord_linked") === "1") {
    window.history.replaceState({}, "", window.location.pathname);
    // Toast is shown after App renders (App reads the flag below)
  }
  if (params.get("discord_error")) {
    window.history.replaceState({}, "", window.location.pathname);
    alert("❌ Discord linking failed. Please try again.");
  }

  const app = new App();

  if (params.get("discord_linked") === "1") {
    // Refresh profile after successful Discord link
    (app as any).refreshUserData?.();
    setTimeout(() => alert("✅ Discord account linked successfully!"), 500);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
