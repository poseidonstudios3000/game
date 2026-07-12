import { BaseError, formatEther } from "viem";

/** Short, human-readable message from a viem/wagmi/unknown error. */
export function errMsg(e: unknown): string {
  if (e instanceof BaseError) return e.shortMessage;
  if (e instanceof Error) return e.message.split("\n")[0];
  return String(e);
}

export function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Format a wei amount (18 decimals) for display with sensible precision.
 * Uses formatEther for the exact decimal string, then trims.
 */
export function formatAmount(wei: bigint): string {
  const exact = formatEther(wei);
  const n = Number(exact);
  if (!Number.isFinite(n)) return exact;
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (abs >= 1) return trimZeros(n.toFixed(4));
  if (abs >= 0.001) return trimZeros(n.toFixed(6));
  if (abs >= 0.000001) return trimZeros(n.toFixed(9));
  return n.toExponential(2);
}

/** ETH amounts: same idea, slightly more precision in the small range. */
export function formatEth(wei: bigint): string {
  return formatAmount(wei);
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export function formatTimestamp(ts: bigint | number): string {
  const ms = Number(ts) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toLocaleString();
}
