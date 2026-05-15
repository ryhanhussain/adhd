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
    const root = document.documentElement;
    const vv = window.visualViewport;

    let raf = 0;
    const readViewport = () => {
      const currentVv = window.visualViewport;
      const width = Math.round(currentVv?.width ?? window.innerWidth);
      const height = Math.round(currentVv?.height ?? window.innerHeight);
      const offsetTop = Math.round(currentVv?.offsetTop ?? 0);
      const offsetLeft = Math.round(currentVv?.offsetLeft ?? 0);
      const rawInset = currentVv
        ? window.innerHeight - currentVv.height - currentVv.offsetTop
        : 0;
      const inset = Math.max(0, Math.round(rawInset));
      const keyboardInset = inset > 20 ? inset : 0;

      root.style.setProperty("--kb", `${keyboardInset}px`);
      root.style.setProperty("--vvw", `${width}px`);
      root.style.setProperty("--vvh", `${height}px`);
      root.style.setProperty("--vv-offset-top", `${offsetTop}px`);
      root.style.setProperty("--vv-offset-left", `${offsetLeft}px`);
      root.dataset.keyboard = keyboardInset > 40 ? "open" : "closed";
    };

    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(readViewport);
    };

    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", update);

    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", update);
    };
  }, []);

  return null;
}
