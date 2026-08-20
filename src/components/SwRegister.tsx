"use client";

import { useEffect } from "react";

// Registers the service worker in production only (avoids dev stale-cache
// confusion). Offline is an enhancement, not a correctness dependency.
export default function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
