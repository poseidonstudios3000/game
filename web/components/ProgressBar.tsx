"use client";

/** Bonding-curve progress bar. `bps` in [0, 10000]; 10000 = graduated. */
export function ProgressBar({
  bps,
  className,
}: {
  bps: bigint | number;
  className?: string;
}) {
  const n = Math.max(0, Math.min(10_000, Number(bps)));
  const pct = n / 100;
  const graduated = n >= 10_000;
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-panel2 ${className ?? ""}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-all ${
          graduated
            ? "bg-gradient-to-r from-pump to-emerald-300"
            : "bg-pump/80"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
