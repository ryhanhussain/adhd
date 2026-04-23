import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#5e43f3",
          color: "#fff",
          fontSize: 96,
          fontWeight: 800,
          letterSpacing: -3,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif",
        }}
      >
        A+
      </div>
    ),
    { ...size },
  );
}
