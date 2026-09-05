/**
 * BeReply wordmark — Believe brand system §3: "Be" prefix in Cyan 400,
 * descriptor in Believe Blue 700 (Paper 50 in the negative variant, for
 * dark/blue surfaces), set in Fraunces 500. Closing dot is Cyan 400,
 * the same signature device that closes the house "Believe." wordmark.
 */
export function BrandMark({
  className = "",
  variant = "positive",
}: {
  className?: string;
  variant?: "positive" | "negative";
}) {
  const descriptorColor = variant === "negative" ? "#fafaf7" : "#0c3bb9";
  return (
    <span
      className={className}
      style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.025em" }}
    >
      <span style={{ color: "#00aaff" }}>Be</span>
      <span style={{ color: descriptorColor }}>Reply</span>
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: "0.22em",
          height: "0.22em",
          marginLeft: "0.22em",
          marginBottom: "0.1em",
          borderRadius: "9999px",
          background: "#00aaff",
        }}
      />
    </span>
  );
}
