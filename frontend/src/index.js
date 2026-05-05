import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register Service Worker for PWA - pass-through SW (no fetch intercept)
// Glowny cel SW: instalacja PWA + samoczynne wyczyszczenie starych cache.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
      });
      // Sprawdzaj update przy kazdym pokazaniu karty
      registration.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      });
    } catch (_e) { /* noop */ }
  });

  // Reaguj na komunikat SW_RELOAD - auto-reload raz na sesje
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'SW_RELOAD' || event.data.type === 'SW_UPDATED') {
      if (sessionStorage.getItem('sw_reload_done')) return;
      sessionStorage.setItem('sw_reload_done', '1');
      window.location.reload();
    }
  });
}
