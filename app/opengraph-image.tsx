import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "ADDit — your second brain for brain dumps, time tracking, and interstitial journaling";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px 96px",
          background:
            "linear-gradient(135deg, #0B0C16 0%, #14102b 55%, #1f1248 100%)",
          color: "#F3F4F6",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -180,
            right: -120,
            width: 520,
            height: 520,
            borderRadius: 9999,
            background:
              "radial-gradient(circle, rgba(139,92,246,0.55) 0%, rgba(139,92,246,0) 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -200,
            left: -160,
            width: 540,
            height: 540,
            borderRadius: 9999,
            background:
              "radial-gradient(circle, rgba(94,67,243,0.45) 0%, rgba(94,67,243,0) 70%)",
            display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 22,
              background: "#5e43f3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 56,
              fontWeight: 800,
              letterSpacing: -2,
              boxShadow: "0 24px 60px rgba(94,67,243,0.45)",
            }}
          >
            A+
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: "#C4C7D0",
              letterSpacing: -0.5,
            }}
          >
            ADDit
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              fontSize: 92,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -3,
              color: "#F3F4F6",
              maxWidth: 980,
              display: "flex",
            }}
          >
            Your second brain for the day in front of you.
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 400,
              lineHeight: 1.35,
              color: "#C4C7D0",
              maxWidth: 920,
              display: "flex",
            }}
          >
            Voice-first brain dumps, interstitial journaling, and quiet time
            tracking — all in one calm app.
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {[
            "Brain dump",
            "Time tracking",
            "Interstitial journaling",
            "Daily intentions",
            "Reflection",
          ].map((label) => (
            <div
              key={label}
              style={{
                padding: "14px 24px",
                borderRadius: 9999,
                fontSize: 26,
                fontWeight: 500,
                color: "#E9E7FF",
                background: "rgba(139,92,246,0.18)",
                border: "1px solid rgba(139,92,246,0.4)",
                display: "flex",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
