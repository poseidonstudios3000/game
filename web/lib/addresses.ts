import type { Address, Chain } from "viem";
import { anvil, robinhood, robinhoodTestnet } from "./chains";

export const SUPPORTED_CHAINS: Record<number, Chain> = {
  [robinhood.id]: robinhood,
  [robinhoodTestnet.id]: robinhoodTestnet,
  [anvil.id]: anvil,
};

const DEFAULT_CHAIN_ID = robinhoodTestnet.id; // 46630

function resolveChainId(): number {
  // NEXT_PUBLIC_ vars are inlined at build time — must be referenced literally.
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (!raw) return DEFAULT_CHAIN_ID;
  const id = Number(raw);
  return Number.isInteger(id) && SUPPORTED_CHAINS[id] ? id : DEFAULT_CHAIN_ID;
}

export const activeChainId = resolveChainId();
export const activeChain: Chain = SUPPORTED_CHAINS[activeChainId];

/**
 * Per-chain factory address defaults. These start empty and get filled in as
 * the PumpFactory is deployed to each network. NEXT_PUBLIC_FACTORY_ADDRESS
 * always overrides.
 */
const FACTORY_ADDRESSES: Record<number, Address | undefined> = {
  [robinhood.id]: undefined,
  [robinhoodTestnet.id]: undefined,
  [anvil.id]: undefined,
};

function resolveFactoryAddress(): Address | undefined {
  const env = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;
  if (env && /^0x[0-9a-fA-F]{40}$/.test(env)) return env as Address;
  return FACTORY_ADDRESSES[activeChainId];
}

/** undefined ⇒ factory not deployed on the active chain; UI shows an empty state. */
export const factoryAddress: Address | undefined = resolveFactoryAddress();

export const explorerUrl: string | undefined =
  activeChain.blockExplorers?.default?.url;

/**
 * Testnet faucets by chain id (mainnet has none). Testers need gas ETH before
 * they can launch or trade, so the UI links this prominently on testnets.
 */
const FAUCET_URLS: Record<number, string> = {
  [robinhoodTestnet.id]: "https://faucet.testnet.chain.robinhood.com",
};

export const faucetUrl: string | undefined = FAUCET_URLS[activeChainId];

/** True on Robinhood testnet / local anvil (viem `testnet` flag). */
export const isTestnet: boolean = Boolean(activeChain.testnet);
