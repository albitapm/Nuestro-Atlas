import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// Claude's original app uses window.storage, which exists in its preview
// environment but is not a standard browser API. For the PWA, provide a
// compatible local persistent implementation using localStorage.
if (!window.storage) {
  window.storage = {
    async get(key) {
      const value = localStorage.getItem(key);
      return value === null ? null : { value };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
      return { value };
    },
    async delete(key) {
      localStorage.removeItem(key);
      return { deleted: true };
    },
  };
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register the service worker for offline app-shell support.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service Worker no registrado:", err);
    });
  });
}
