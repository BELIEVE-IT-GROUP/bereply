/**
 * BeReply wordmark — Believe brand system §3: "Be" prefix in Cyan 400,
 * descriptor in Believe Blue 700, set in Fraunces 500. Closing dot is
 * Cyan 400, the same signature device that closes the house "Believe."
 * wordmark. On the negative variant (dark/blue surfaces, e.g. the sidebar)
 * the whole wordmark goes Paper 50 and only the dot stays cyan — per
 * Jorge, 2026-09-05.
 */
export function BrandMark({
  className = "",
  variant = "positive",
}: {
  className?: string;
  variant?: "positive" | "negative";
}) {
  const wordColor = variant === "negative" ? "#fafaf7" : "#00aaff";
  const descriptorColor = variant === "negative" ? "#fafaf7" : "#0c3bb9";
  return (
    <span
      className={className}
      style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.025em" }}
    >
      <span style={{ color: wordColor }}>Be</span>
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
