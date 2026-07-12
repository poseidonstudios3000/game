/** Protocol constants mirrored from SPEC.md (fixed for every launched token). */
export const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n; // 1B, 18 decimals
export const CURVE_SUPPLY = 800_000_000n * 10n ** 18n; // 80% sellable on curve
export const LP_RESERVE = 200_000_000n * 10n ** 18n; // 20% held for DEX LP
export const VIRTUAL_TOKEN_START = 1_073_000_000n * 10n ** 18n;
export const FEE_BPS = 100n; // 1% on buys and sells
export const BPS = 10_000n;

/** Frontend defaults */
export const DEFAULT_SLIPPAGE_BPS = 200n; // 2%
export const POLL_MS = 4_000; // react-query refetch interval
export const TRADE_LOG_BLOCK_RANGE = 5_000n; // Trade getLogs lookback

/** Graduation target ≈ virtualEthStart * 800 / 273 (total ETH to sell out the curve). */
export function graduationTarget(virtualEthStart: bigint): bigint {
  return (virtualEthStart * 800n) / 273n;
}
