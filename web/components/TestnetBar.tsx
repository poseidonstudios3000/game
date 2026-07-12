import { activeChain, explorerUrl, faucetUrl, isTestnet } from "@/lib/addresses";

/**
 * Slim strip shown on testnets, pointing users at the faucet (gas ETH) and the
 * block explorer. Hidden on mainnet and on local anvil (no faucet/explorer).
 */
export function TestnetBar() {
  if (!isTestnet || (!faucetUrl && !explorerUrl)) return null;

  return (
    <div className="border-b border-edge bg-panel/60">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-[11px] text-mute">
        <span className="font-mono font-bold uppercase tracking-widest text-amber-400">
          Testnet
        </span>
        <span className="font-mono">{activeChain.name}</span>
        <span className="text-mute/50">·</span>
        <span>Play money — get gas from the faucet, no real value.</span>
        <span className="ml-auto flex items-center gap-3">
          {faucetUrl && (
            <a
              href={faucetUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-pump underline decoration-dotted underline-offset-2 hover:brightness-110"
            >
              Get test ETH ↗
            </a>
          )}
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-zinc-300 underline decoration-dotted underline-offset-2 hover:text-pump"
            >
              Explorer ↗
            </a>
          )}
        </span>
      </div>
    </div>
  );
}
