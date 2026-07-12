"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddr } from "@/lib/format";

/**
 * Injected-connector-only connect button. Wallet-dependent UI is gated behind
 * a mounted check to avoid SSR/client hydration mismatches.
 */
export function ConnectButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();

  if (!mounted) {
    return (
      <button
        className="rounded-md border border-edge bg-panel px-3 py-1.5 text-sm font-semibold text-mute"
        disabled
      >
        Connect
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        title="Disconnect"
        className="rounded-md border border-edge bg-panel px-3 py-1.5 font-mono text-sm text-pump transition hover:border-dump hover:text-dump"
      >
        {shortAddr(address)}
      </button>
    );
  }

  const injectedConnector = connectors[0];

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span
          className="max-w-40 truncate text-xs text-dump"
          title={error.message}
        >
          {error.message.split("\n")[0]}
        </span>
      )}
      <button
        onClick={() =>
          injectedConnector && connect({ connector: injectedConnector })
        }
        disabled={isPending || !injectedConnector}
        className="rounded-md border border-pump/50 bg-panel px-3 py-1.5 text-sm font-semibold text-pump transition hover:bg-pump-dim disabled:opacity-50"
      >
        {isPending ? "Connecting…" : "Connect"}
      </button>
    </div>
  );
}
