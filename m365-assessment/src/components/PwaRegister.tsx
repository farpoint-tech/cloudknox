"use client";

import { useEffect } from "react";

/** Registers the service worker so the app is installable as a PWA. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // avoid dev caching
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration is best-effort; the app works without it */
    });
  }, []);
  return null;
}
