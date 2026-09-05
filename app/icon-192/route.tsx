import { ImageResponse } from "next/og";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c3bb9",
          color: "#fafaf7",
          fontFamily: "sans-serif",
          fontWeight: 600,
          fontSize: 120,
        }}
      >
        B
      </div>
    ),
    { width: 192, height: 192 }
  );
}
