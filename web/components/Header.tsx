"use client";

import Link from "next/link";
import { activeChain } from "@/lib/addresses";
import { APP_CHANNEL, APP_VERSION_LABEL } from "@/lib/version";
import { ConnectButton } from "./ConnectButton";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-edge bg-ink/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="text-lg font-black tracking-tight text-pump group-hover:drop-shadow-[0_0_8px_rgba(61,255,136,0.6)]">
            Hood<span className="text-zinc-100">Pump</span>
          </span>
          <span className="rounded border border-pump/40 bg-pump-dim px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-pump">
            {APP_CHANNEL}
          </span>
          <span
            className="font-mono text-[10px] tracking-wide text-mute"
            title={`HoodPump ${APP_VERSION_LABEL} · ${APP_CHANNEL}`}
          >
            {APP_VERSION_LABEL}
          </span>
          <span className="hidden rounded border border-edge bg-panel px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-mute sm:inline">
            {activeChain.name}
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/create"
            className="rounded-md bg-pump px-3 py-1.5 text-sm font-bold text-black transition hover:brightness-110"
          >
            Launch a coin
          </Link>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
