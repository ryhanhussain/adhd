/**
 * Small tap-location confetti burst. Creates DOM particles at (x, y) that
 * drift outward and fade over ~600ms, then clean themselves up. No deps,
 * no React re-renders, no layout shift — particles are position: fixed and
 * pointer-events: none.
 *
 * Respects prefers-reduced-motion by silently no-op'ing.
 */

const COLORS = [
  "#8b5cf6",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#3b82f6",
];

export function confettiBurst(x: number, y: number, count = 6): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = "0";
  container.style.height = "0";
  container.style.pointerEvents = "none";
  container.style.zIndex = "9999";
  document.body.appendChild(container);

  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    const color = COLORS[i % COLORS.length];
    const size = 5 + Math.random() * 4;
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    const distance = 36 + Math.random() * 30;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 12; // bias upward
    const rot = (Math.random() - 0.5) * 540;

    p.style.position = "absolute";
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.width = `${size}px`;
    p.style.height = `${size * 1.6}px`;
    p.style.borderRadius = "2px";
    p.style.backgroundColor = color;
    p.style.boxShadow = `0 0 8px ${color}80`;
    p.style.opacity = "1";
    p.style.transform = "translate(-50%, -50%) rotate(0deg)";
    p.style.transition = "transform 600ms cubic-bezier(.2,.8,.2,1), opacity 600ms ease-out";
    p.style.willChange = "transform, opacity";

    container.appendChild(p);

    // Force style flush before transitioning.
    void p.offsetWidth;

    p.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg)`;
    p.style.opacity = "0";
  }

  setTimeout(() => {
    container.remove();
  }, 700);
}
