"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { parseEther, parseEventLogs } from "viem";
import {
  useAccount,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { NoFactory } from "@/components/NoFactory";
import { activeChain, factoryAddress } from "@/lib/addresses";
import { factoryAbi } from "@/lib/factoryAbi";

const LIMITS = { name: 32, symbol: 10, imageUrl: 256, description: 512 };

const byteLen = (s: string) => new TextEncoder().encode(s).length;

export default function CreatePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [initialBuy, setInitialBuy] = useState("");

  const {
    writeContract,
    data: txHash,
    isPending: submitting,
    error: writeError,
    reset,
  } = useWriteContract();

  const {
    data: receipt,
    isLoading: confirming,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  // On receipt: parse TokenCreated to find the new token address, then route.
  const createdToken = useMemo(() => {
    if (!receipt) return null;
    const created = parseEventLogs({
      abi: factoryAbi,
      logs: receipt.logs,
      eventName: "TokenCreated",
    });
    return created[0]?.args.token ?? null;
  }, [receipt]);

  useEffect(() => {
    if (createdToken) router.push(`/coin/${createdToken}`);
  }, [createdToken, router]);

  const initialBuyWei = useMemo(() => {
    const v = initialBuy.trim();
    if (!v) return 0n;
    try {
      return parseEther(v);
    } catch {
      return null; // invalid input
    }
  }, [initialBuy]);

  // The contract enforces UTF-8 *byte* lengths; JS .length counts UTF-16 code
  // units, so emoji/CJK would pass a char check and still revert on-chain.
  const validation = useMemo(() => {
    if (!name.trim()) return "Name is required";
    if (byteLen(name) > LIMITS.name)
      return `Name must be ≤ ${LIMITS.name} bytes (emoji count as 4)`;
    if (!symbol.trim()) return "Symbol is required";
    if (byteLen(symbol) > LIMITS.symbol)
      return `Symbol must be ≤ ${LIMITS.symbol} bytes (emoji count as 4)`;
    if (byteLen(imageUrl) > LIMITS.imageUrl)
      return `Image URL must be ≤ ${LIMITS.imageUrl} bytes`;
    if (byteLen(description) > LIMITS.description)
      return `Description must be ≤ ${LIMITS.description} bytes (emoji count as 4)`;
    if (initialBuyWei === null) return "Initial buy is not a valid ETH amount";
    if (initialBuyWei < 0n) return "Initial buy cannot be negative";
    return null;
  }, [name, symbol, imageUrl, description, initialBuyWei]);

  if (!factoryAddress) return <NoFactory />;

  const wrongChain = isConnected && chainId !== activeChain.id;
  const busy = submitting || confirming;
  const error = writeError ?? receiptError;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validation || !factoryAddress || initialBuyWei === null) return;
    reset();
    writeContract({
      abi: factoryAbi,
      address: factoryAddress,
      functionName: "createToken",
      args: [name.trim(), symbol.trim(), imageUrl.trim(), description.trim()],
      value: initialBuyWei,
      chainId: activeChain.id,
    });
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-black tracking-tight text-zinc-100">
        Launch a <span className="text-pump">coin</span>
      </h1>
      <p className="mt-1 text-sm text-mute">
        1B supply, 80% on the bonding curve, 20% reserved for DEX liquidity at
        graduation. 1% fee on trades. No presale, no owner keys.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-6 space-y-4 rounded-xl border border-edge bg-panel p-5"
      >
        <Field label={`Name (≤ ${LIMITS.name})`}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.name}
            placeholder="Doge On The Hood"
            className={inputCls}
            required
          />
        </Field>

        <Field label={`Symbol (≤ ${LIMITS.symbol})`}>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            maxLength={LIMITS.symbol}
            placeholder="HOODDOGE"
            className={`${inputCls} font-mono uppercase`}
            required
          />
        </Field>

        <Field label="Image URL (optional)">
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            maxLength={LIMITS.imageUrl}
            placeholder="https://…/dog.png"
            className={`${inputCls} font-mono`}
            type="url"
          />
        </Field>

        <Field label={`Description (optional, ≤ ${LIMITS.description})`}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={LIMITS.description}
            rows={3}
            placeholder="The first dog on Robinhood Chain."
            className={inputCls}
          />
          <span className="mt-1 block text-right font-mono text-[10px] text-mute">
            {byteLen(description)}/{LIMITS.description} bytes
          </span>
        </Field>

        <Field label="Initial buy in ETH (optional — be first in your own coin)">
          <input
            value={initialBuy}
            onChange={(e) => setInitialBuy(e.target.value)}
            placeholder="0.0"
            inputMode="decimal"
            className={`${inputCls} font-mono`}
          />
        </Field>

        {validation && (name || symbol || imageUrl || initialBuy) && (
          <p className="text-xs text-dump">{validation}</p>
        )}

        {error && (
          <p className="break-all rounded border border-dump/40 bg-dump-dim/40 p-2 font-mono text-xs text-dump">
            {error.message.split("\n")[0]}
          </p>
        )}

        {!mounted ? (
          <button type="button" disabled className={btnCls}>
            Launch
          </button>
        ) : !isConnected ? (
          <p className="rounded border border-edge bg-panel2 p-3 text-center text-sm text-mute">
            Connect your wallet (top right) to launch a coin.
          </p>
        ) : wrongChain ? (
          <button
            type="button"
            onClick={() => switchChain({ chainId: activeChain.id })}
            disabled={switching}
            className={btnCls}
          >
            {switching ? "Switching…" : `Switch to ${activeChain.name}`}
          </button>
        ) : (
          <button
            type="submit"
            disabled={!!validation || busy || !address}
            className={btnCls}
          >
            {submitting
              ? "Confirm in wallet…"
              : confirming
                ? "Deploying…"
                : "Launch 🚀"}
          </button>
        )}

        {receipt &&
          (createdToken ? (
            <p className="text-center text-xs text-pump">
              Launched! Redirecting to your coin…
            </p>
          ) : (
            <p className="text-xs text-mute">
              Confirmed, but no TokenCreated event was found in the receipt.
            </p>
          ))}
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-edge bg-panel2 px-3 py-2 text-sm text-zinc-100 placeholder:text-mute/60 outline-none focus:border-pump/60";

const btnCls =
  "w-full rounded-md bg-pump px-4 py-2.5 text-sm font-bold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-mute">
        {label}
      </span>
      {children}
    </label>
  );
}
