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

// Register Service Worker for PWA - z auto-aktualizacja przy nowym deployu
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none', // przegladarka nigdy nie cachuje sw.js
      });

      // Sprawdz update co otwarcie karty + co 60s gdy karta jest widoczna
      registration.update().catch(() => {});
      setInterval(() => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      }, 60 * 1000);

      // Gdy nowy SW jest zainstalowany -> aktywuj natychmiast
      registration.addEventListener('updatefound', () => {
        const nw = registration.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            nw.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    } catch (_e) { /* noop */ }
  });

  // Gdy nowy SW przejmie kontrole -> przeladuj strone (raz)
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  // Dodatkowo: komunikat SW_UPDATED z SW (cache wyczyszczony)
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SW_UPDATED') {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    }
  });
}
