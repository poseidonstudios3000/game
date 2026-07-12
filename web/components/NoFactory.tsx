"use client";

import { activeChain } from "@/lib/addresses";

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
    </div>
  );
}
