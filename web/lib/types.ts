import type { Address } from "viem";

/** Mirrors the SPEC.md Curve struct (as decoded by viem). */
export interface Curve {
  creator: Address;
  virtualEth: bigint;
  virtualToken: bigint;
  realEth: bigint;
  realToken: bigint;
  createdAt: bigint;
  graduated: boolean;
  lpDeployed: boolean;
}

/** Mirrors the SPEC.md TokenMeta struct. */
export interface TokenMeta {
  name: string;
  symbol: string;
  imageUrl: string;
  description: string;
}

/** Mirrors the SPEC.md TokenView struct. */
export interface TokenView {
  token: Address;
  curve: Curve;
  meta: TokenMeta;
}
