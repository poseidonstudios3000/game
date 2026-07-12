"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { getAddress, isAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { NoFactory } from "@/components/NoFactory";
import { ProgressBar } from "@/components/ProgressBar";
import { TokenImage } from "@/components/TokenImage";
import { TradePanel } from "@/components/TradePanel";
import { TradesTable } from "@/components/TradesTable";
import { explorerUrl, factoryAddress } from "@/lib/addresses";
import {
  BPS,
  CURVE_SUPPLY,
  graduationTarget,
  POLL_MS,
  TOTAL_SUPPLY,
} from "@/lib/constants";
import { factoryAbi } from "@/lib/factoryAbi";
import {
  errMsg,
  formatAmount,
  formatEth,
  formatTimestamp,
  shortAddr,
} from "@/lib/format";
import type { Curve, TokenMeta } from "@/lib/types";

export default function CoinPage() {
  const params = useParams<{ address: string }>();
  const raw = typeof params?.address === "string" ? params.address : "";
  const valid = isAddress(raw, { strict: false });
  const token: Address | undefined = valid ? getAddress(raw) : undefined;

  const {
    data: curve,
    error: curveError,
    isLoading: curveLoading,
  } = useReadContract({
    abi: factoryAbi,
    address: factoryAddress,
    functionName: "curves",
    args: [token ?? "0x0000000000000000000000000000000000000000"],
    query: {
      enabled: !!factoryAddress && !!token,
      refetchInterval: POLL_MS,
    },
  });

  const { data: meta } = useReadContract({
    abi: factoryAbi,
    address: factoryAddress,
    functionName: "tokenMeta",
    args: [token ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!factoryAddress && !!token },
  });

  const { data: vEthStart } = useReadContract({
    abi: factoryAbi,
    address: factoryAddress,
    functionName: "virtualEthStart",
    query: { enabled: !!factoryAddress },
  });

  if (!factoryAddress) return <NoFactory />;

  if (!valid || !token) {
    return (
      <ErrorState title="Invalid token address">
        <span className="break-all font-mono">{raw || "(empty)"}</span> is not
        a valid address.
      </ErrorState>
    );
  }

  if (curveError) {
    return (
      <ErrorState title="Failed to load coin">
        <span className="break-all font-mono text-xs">
          {errMsg(curveError)}
        </span>
      </ErrorState>
    );
  }

  if (curveLoading || !curve) return <PageSkeleton />;

  // Unknown token: factory returns a zeroed curve (createdAt == 0).
  if (curve.createdAt === 0n) {
    return (
      <ErrorState title="Unknown token">
        <span className="break-all font-mono">{token}</span> was not launched
        through this factory.
      </ErrorState>
    );
  }

  const symbol = meta?.symbol ?? "???";

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs text-mute transition hover:text-pump"
      >
        ← All coins
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <InfoCard token={token} curve={curve} meta={meta} />
          <CurveCard curve={curve} vEthStart={vEthStart} />
          <TradesTable token={token} symbol={symbol} />
        </div>
        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <TradePanel token={token} curve={curve} symbol={symbol} />
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  token,
  curve,
  meta,
}: {
  token: Address;
  curve: Curve;
  meta: TokenMeta | undefined;
}) {
  const marketCap =
    curve.virtualToken > 0n
      ? (curve.virtualEth * TOTAL_SUPPLY) / curve.virtualToken
      : 0n;
  // spot price scaled by 1e18 so it survives integer division
  const spotPriceX18 =
    curve.virtualToken > 0n
      ? (curve.virtualEth * 10n ** 18n) / curve.virtualToken
      : 0n;

  return (
    <section className="rounded-xl border border-edge bg-panel p-4">
      <div className="flex gap-4">
        <TokenImage
          src={meta?.imageUrl || undefined}
          symbol={meta?.symbol ?? "?"}
          className="h-24 w-24 shrink-0 rounded-lg border border-edge"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-black text-zinc-100">
              {meta?.name ?? "…"}
            </h1>
            <span className="font-mono text-sm text-mute">
              ${meta?.symbol ?? "…"}
            </span>
            {curve.graduated && (
              <span className="rounded border border-pump/50 bg-pump-dim px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-pump">
                Graduated
              </span>
            )}
          </div>
          {meta?.description ? (
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-zinc-400">
              {meta.description}
            </p>
          ) : (
            <p className="mt-1 text-sm italic text-mute/60">No description.</p>
          )}
          <p className="mt-2 text-xs text-mute">
            by{" "}
            <AddrLink addr={curve.creator} kind="address">
              {shortAddr(curve.creator)}
            </AddrLink>{" "}
            · {formatTimestamp(curve.createdAt)}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-edge pt-4 sm:grid-cols-4">
        <Stat label="Market cap" value={`${formatEth(marketCap)} ETH`} />
        <Stat
          label="Spot price"
          value={`${formatEth(spotPriceX18)} ETH`}
          sub="per token"
        />
        <Stat
          label="Curve tokens left"
          value={formatAmount(curve.realToken)}
        />
        <Stat label="ETH in curve" value={`${formatEth(curve.realEth)} ETH`} />
      </dl>

      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-edge pt-3 font-mono text-[11px] text-mute">
        <span className="break-all">{token}</span>
        {explorerUrl && (
          <AddrLink addr={token} kind="address">
            explorer ↗
          </AddrLink>
        )}
      </p>
    </section>
  );
}

function CurveCard({
  curve,
  vEthStart,
}: {
  curve: Curve;
  vEthStart: bigint | undefined;
}) {
  const progress =
    CURVE_SUPPLY > 0n
      ? ((CURVE_SUPPLY - curve.realToken) * BPS) / CURVE_SUPPLY
      : 0n;
  const target = vEthStart !== undefined ? graduationTarget(vEthStart) : null;

  return (
    <section className="rounded-xl border border-edge bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-black uppercase tracking-widest text-mute">
          Bonding curve
        </h3>
        <span className="font-mono text-sm font-bold text-pump">
          {(Number(progress) / 100).toFixed(1)}%
        </span>
      </div>
      <ProgressBar bps={progress} className="mt-2 !h-2.5" />
      <p className="mt-2 text-xs text-mute">
        {curve.graduated ? (
          <>
            Curve complete — raised{" "}
            <span className="font-mono text-pump">
              {formatEth(curve.realEth)} ETH
            </span>
            .{" "}
            {curve.lpDeployed
              ? "Liquidity deployed to the DEX."
              : "Awaiting liquidity deployment."}
          </>
        ) : target !== null ? (
          <>
            <span className="font-mono text-zinc-200">
              {formatEth(curve.realEth)} ETH
            </span>{" "}
            raised of ≈{" "}
            <span className="font-mono text-zinc-200">
              {formatEth(target)} ETH
            </span>{" "}
            graduation target. At 100% the curve closes and liquidity moves to
            the DEX.
          </>
        ) : (
          <>
            <span className="font-mono text-zinc-200">
              {formatEth(curve.realEth)} ETH
            </span>{" "}
            raised on the curve.
          </>
        )}
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-mute">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm text-zinc-100">{value}</dd>
      {sub && <dd className="font-mono text-[10px] text-mute">{sub}</dd>}
    </div>
  );
}

function AddrLink({
  addr,
  kind,
  children,
}: {
  addr: string;
  kind: "address" | "tx";
  children: React.ReactNode;
}) {
  if (!explorerUrl)
    return <span className="font-mono text-zinc-400">{children}</span>;
  return (
    <a
      href={`${explorerUrl}/${kind}/${addr}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-zinc-400 underline decoration-dotted transition hover:text-pump"
    >
      {children}
    </a>
  );
}

function ErrorState({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dump/40 bg-panel px-6 py-16 text-center">
      <span className="text-4xl">💀</span>
      <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
      <p className="max-w-md text-sm text-mute">{children}</p>
      <Link
        href="/"
        className="mt-2 rounded-md border border-edge bg-panel2 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-pump/50 hover:text-pump"
      >
        Back to all coins
      </Link>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="grid animate-pulse gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <div className="h-48 rounded-xl border border-edge bg-panel" />
        <div className="h-24 rounded-xl border border-edge bg-panel" />
        <div className="h-64 rounded-xl border border-edge bg-panel" />
      </div>
      <div className="h-96 rounded-xl border border-edge bg-panel" />
    </div>
  );
}
