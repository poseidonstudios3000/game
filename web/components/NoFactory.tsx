"use client";

import { activeChain, explorerUrl, faucetUrl } from "@/lib/addresses";

/** Shown when NEXT_PUBLIC_FACTORY_ADDRESS is unset and no per-chain default exists. */
export function NoFactory() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-edge bg-panel px-6 py-16 text-center">
      <span className="text-4xl">🏗️</span>
      <h2 className="text-lg font-bold text-zinc-100">
        Factory not deployed on this chain
      </h2>
      <p className="max-w-md text-sm text-mute">
        No PumpFactory address is configured for{" "}
        <span className="font-mono text-zinc-300">{activeChain.name}</span>{" "}
        (chain id{" "}
        <span className="font-mono text-zinc-300">{activeChain.id}</span>). Set{" "}
        <span className="font-mono text-pump">
          NEXT_PUBLIC_FACTORY_ADDRESS
        </span>{" "}
        (and optionally{" "}
        <span className="font-mono text-pump">NEXT_PUBLIC_CHAIN_ID</span>) and
        rebuild.
      </p>
      {(faucetUrl || explorerUrl) && (
        <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
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
              Block explorer ↗
            </a>
          )}
        </p>
      )}
    </div>
  );
}
