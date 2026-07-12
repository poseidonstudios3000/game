"use client";

import { useState } from "react";

/**
 * User-supplied token image from an arbitrary remote URL — plain <img> on
 * purpose (next/image would require whitelisting every remote host). Falls
 * back to a symbol-monogram placeholder on error / missing URL.
 */
export function TokenImage({
  src,
  symbol,
  className,
}: {
  src?: string;
  symbol: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImg = !!src && !failed;

  if (showImg) {
    return (
      <img
        src={src}
        alt={symbol}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${className ?? ""} object-cover`}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`${className ?? ""} flex items-center justify-center bg-gradient-to-br from-pump-dim via-panel2 to-dump-dim`}
    >
      <span className="font-mono text-2xl font-black text-pump/70">
        {(symbol || "?").slice(0, 3).toUpperCase()}
      </span>
    </div>
  );
}
