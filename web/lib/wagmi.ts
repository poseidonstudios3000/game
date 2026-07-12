import { http } from "viem";
import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { activeChain } from "./addresses";

/**
 * Single-chain wagmi config: the active chain comes from NEXT_PUBLIC_CHAIN_ID.
 * Injected connector only for alpha (no WalletConnect).
 */
export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  transports: {
    [activeChain.id]: http(),
  },
  ssr: true,
});
