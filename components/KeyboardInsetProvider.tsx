"use client";

import { useEffect } from "react";

/**
 * Tracks the on-screen keyboard height via the VisualViewport API and exposes
 * it as a CSS variable (`--kb`) plus a `data-keyboard` attribute on <html>.
 * Works on iOS Safari (where position:fixed doesn't follow the keyboard) and
 * Android Chrome (where behaviour varies by browser/mode).
 */
export default function KeyboardInsetProvider() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    if (!vv) {
      root.style.setProperty("--kb", "0px");
      return;
    }

    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        root.style.setProperty("--kb", `${inset}px`);
        root.dataset.keyboard = inset > 40 ? "open" : "closed";
      });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);

    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return null;
}
