"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { NoFactory } from "@/components/NoFactory";
import { ProgressBar } from "@/components/ProgressBar";
import { TokenImage } from "@/components/TokenImage";
import { factoryAddress } from "@/lib/addresses";
import { BPS, CURVE_SUPPLY, POLL_MS, TOTAL_SUPPLY } from "@/lib/constants";
import { factoryAbi } from "@/lib/factoryAbi";
import { formatEth, shortAddr } from "@/lib/format";
import type { TokenView } from "@/lib/types";

// getTokens copies each token's full metadata in one eth_call; an unbounded
// read hits RPC gas/response caps somewhere in the hundreds of tokens, so the
// grid loads newest-first in fixed-size chunks with a Load More walk-back.
const PAGE_SIZE = 60n;

export default function HomePage() {
  const [pages, setPages] = useState(1);

  const { data: count, error: countError } = useReadContract({
    abi: factoryAbi,
    address: factoryAddress,
    functionName: "tokenCount",
    query: { enabled: !!factoryAddress, refetchInterval: POLL_MS },
  });

  // Chunks walk backwards from the newest token: [count-60, count), then
  // [count-120, count-60), ... Boundaries shift as new tokens land; the merge
  // below dedupes by address.
  const chunks = useMemo(() => {
    if (count === undefined || count === 0n) return [];
    const out: { offset: bigint; limit: bigint }[] = [];
    let end = count;
    for (let i = 0; i < pages && end > 0n; i++) {
      const offset = end > PAGE_SIZE ? end - PAGE_SIZE : 0n;
      out.push({ offset, limit: end - offset });
      end = offset;
    }
    return out;
  }, [count, pages]);

  const {
    data: chunkResults,
    error,
    isLoading,
  } = useReadContracts({
    contracts: chunks.map((c) => ({
      abi: factoryAbi,
      address: factoryAddress,
      functionName: "getTokens" as const,
      args: [c.offset, c.limit] as const,
    })),
    query: {
      enabled: !!factoryAddress && chunks.length > 0,
      refetchInterval: POLL_MS,
    },
  });

  const sorted = useMemo(() => {
    if (!chunkResults) return [];
    const byAddr = new Map<string, TokenView>();
    for (const r of chunkResults) {
      if (r.status !== "success") continue;
      for (const t of r.result as readonly TokenView[]) byAddr.set(t.token, t);
    }
    return [...byAddr.values()].sort((a, b) =>
      Number(b.curve.createdAt - a.curve.createdAt),
    );
  }, [chunkResults]);

  const hasMore =
    count !== undefined && BigInt(pages) * PAGE_SIZE < count;
  // Only surface a hard error when nothing rendered; partial chunk failures
  // still show whatever loaded.
  const allChunksFailed =
    chunkResults !== undefined &&
    chunkResults.length > 0 &&
    chunkResults.every((r) => r.status === "failure");

  if (!factoryAddress) {
    return (
      <>
        <Hero />
        <NoFactory />
      </>
    );
  }

  const anyError =
    countError ??
    (allChunksFailed && sorted.length === 0 ? error ?? chunkFailure(chunkResults) : undefined);

  return (
    <>
      <Hero />
      {anyError ? (
        <div className="rounded-xl border border-dump/40 bg-dump-dim/40 p-6 text-sm text-dump">
          <p className="font-bold">Failed to load coins</p>
          <p className="mt-1 break-all font-mono text-xs opacity-80">
            {anyError.message.split("\n")[0]}
          </p>
        </div>
      ) : count === undefined || (isLoading && count > 0n) ? (
        <GridSkeleton />
      ) : count === 0n || sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-edge bg-panel px-6 py-16 text-center">
          <span className="text-4xl">🫥</span>
          <h2 className="text-lg font-bold text-zinc-100">No coins yet</h2>
          <p className="text-sm text-mute">
            Be the degen who launches the first one.
          </p>
          <Link
            href="/create"
            className="mt-2 rounded-md bg-pump px-4 py-2 text-sm font-bold text-black transition hover:brightness-110"
          >
            Launch a coin
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((t) => (
              <CoinCard key={t.token} view={t} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setPages((p) => p + 1)}
                className="rounded-md border border-edge bg-panel px-5 py-2.5 text-sm font-bold text-mute transition hover:border-pump/50 hover:text-pump"
              >
                Load older coins
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function chunkFailure(
  results: readonly { status: string; error?: Error }[] | undefined,
): Error | undefined {
  return results?.find((r) => r.status === "failure")?.error;
}

function Hero() {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-black tracking-tight text-zinc-100">
        Fresh off the <span className="text-pump">curve</span>
      </h1>
      <p className="mt-1 text-sm text-mute">
        Every coin starts on a bonding curve. Fill it up and it graduates to
        the DEX. 1% fee per trade. No presale, no team allocation.
      </p>
    </div>
  );
}

function CoinCard({ view }: { view: TokenView }) {
  const { token, curve, meta } = view;
  const marketCap =
    curve.virtualToken > 0n
      ? (curve.virtualEth * TOTAL_SUPPLY) / curve.virtualToken
      : 0n;
  const progress =
    CURVE_SUPPLY > 0n
      ? ((CURVE_SUPPLY - curve.realToken) * BPS) / CURVE_SUPPLY
      : 0n;

  return (
    <Link
      href={`/coin/${token}`}
      className="group flex gap-3 rounded-xl border border-edge bg-panel p-3 transition hover:border-pump/60 hover:shadow-[0_0_20px_rgba(61,255,136,0.08)]"
    >
      <TokenImage
        src={meta.imageUrl || undefined}
        symbol={meta.symbol}
        className="h-20 w-20 shrink-0 rounded-lg border border-edge"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-bold text-zinc-100 group-hover:text-pump">
            {meta.name}
          </span>
          <span className="shrink-0 font-mono text-xs text-mute">
            ${meta.symbol}
          </span>
          {curve.graduated && (
            <span className="ml-auto shrink-0 rounded border border-pump/50 bg-pump-dim px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-pump">
              Graduated
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-mute">
          MC{" "}
          <span className="font-mono text-zinc-200">
            {formatEth(marketCap)} ETH
          </span>
        </p>
        <p className="truncate text-xs text-mute">
          by{" "}
          <span className="font-mono text-zinc-400">
            {shortAddr(curve.creator)}
          </span>
        </p>
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar bps={progress} className="flex-1" />
          <span className="shrink-0 font-mono text-[10px] text-mute">
            {(Number(progress) / 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </Link>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse gap-3 rounded-xl border border-edge bg-panel p-3"
        >
          <div className="h-20 w-20 shrink-0 rounded-lg bg-panel2" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-2/3 rounded bg-panel2" />
            <div className="h-3 w-1/2 rounded bg-panel2" />
            <div className="h-3 w-1/3 rounded bg-panel2" />
            <div className="h-2 w-full rounded bg-panel2" />
          </div>
        </div>
      ))}
    </div>
  );
}
