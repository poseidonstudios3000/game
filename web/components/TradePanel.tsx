"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { erc20Abi, formatEther, parseEther, type Address } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { activeChain, explorerUrl, factoryAddress } from "@/lib/addresses";
import { BPS, DEFAULT_SLIPPAGE_BPS, POLL_MS } from "@/lib/constants";
import { factoryAbi } from "@/lib/factoryAbi";
import { errMsg, formatAmount, formatEth } from "@/lib/format";
import type { Curve } from "@/lib/types";

function tryParseEther(v: string): bigint | null {
  const s = v.trim();
  if (!s) return null;
  try {
    const wei = parseEther(s);
    return wei > 0n ? wei : null;
  } catch {
    return null;
  }
}

export function TradePanel({
  token,
  curve,
  symbol,
}: {
  token: Address;
  curve: Curve;
  symbol: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [buyIn, setBuyIn] = useState("");
  const [sellIn, setSellIn] = useState("");
  const [slippage, setSlippage] = useState("2");
  const [busy, setBusy] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<`0x${string}` | null>(null);

  const graduated = curve.graduated;

  const slippageBps = useMemo(() => {
    const pct = Number.parseFloat(slippage);
    if (!Number.isFinite(pct) || pct < 0 || pct > 50)
      return DEFAULT_SLIPPAGE_BPS;
    return BigInt(Math.round(pct * 100));
  }, [slippage]);

  const buyWei = tryParseEther(buyIn);
  const sellWei = tryParseEther(sellIn);

  // ---- live quotes ----
  const { data: buyQuote, error: buyQuoteError } = useReadContract({
    abi: factoryAbi,
    address: factoryAddress,
    functionName: "quoteBuy",
    args: [token, buyWei ?? 0n],
    query: {
      enabled: !!factoryAddress && !!buyWei && !graduated && tab === "buy",
      refetchInterval: POLL_MS,
    },
  });

  const { data: sellQuote, error: sellQuoteError } = useReadContract({
    abi: factoryAbi,
    address: factoryAddress,
    functionName: "quoteSell",
    args: [token, sellWei ?? 0n],
    query: {
      enabled: !!factoryAddress && !!sellWei && !graduated && tab === "sell",
      refetchInterval: POLL_MS,
    },
  });

  // ---- balances & allowance ----
  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address, refetchInterval: POLL_MS },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: "allowance",
    args: [
      address ?? "0x0000000000000000000000000000000000000000",
      factoryAddress ?? "0x0000000000000000000000000000000000000000",
    ],
    query: { enabled: !!address && !!factoryAddress },
  });

  const minTokensOut = buyQuote
    ? (buyQuote[0] * (BPS - slippageBps)) / BPS
    : 0n;
  const minEthOut = sellQuote
    ? (sellQuote[0] * (BPS - slippageBps)) / BPS
    : 0n;

  const needsApprove =
    sellWei !== null && allowance !== undefined && allowance < sellWei;

  const wrongChain = isConnected && chainId !== activeChain.id;

  async function run(label: string, fn: () => Promise<`0x${string}`>) {
    if (!publicClient) return;
    setTxError(null);
    setBusy(label);
    try {
      const hash = await fn();
      setLastTx(hash);
      setBusy(`${label} — pending…`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      await queryClient.invalidateQueries();
      return true;
    } catch (e) {
      setTxError(errMsg(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function doBuy() {
    const factory = factoryAddress;
    if (!factory || !buyWei || !buyQuote) return;
    const ok = await run("Buying", () =>
      writeContractAsync({
        abi: factoryAbi,
        address: factory,
        functionName: "buy",
        args: [token, minTokensOut],
        value: buyWei,
        chainId: activeChain.id,
      }),
    );
    if (ok) {
      setBuyIn("");
      refetchBalance();
    }
  }

  async function doApprove() {
    const factory = factoryAddress;
    if (!factory || !sellWei) return;
    const ok = await run("Approving", () =>
      writeContractAsync({
        abi: erc20Abi,
        address: token,
        functionName: "approve",
        args: [factory, sellWei],
        chainId: activeChain.id,
      }),
    );
    if (ok) await refetchAllowance();
  }

  async function doSell() {
    const factory = factoryAddress;
    if (!factory || !sellWei || !sellQuote) return;
    const ok = await run("Selling", () =>
      writeContractAsync({
        abi: factoryAbi,
        address: factory,
        functionName: "sell",
        args: [token, sellWei, minEthOut],
        chainId: activeChain.id,
      }),
    );
    if (ok) {
      setSellIn("");
      refetchBalance();
      refetchAllowance();
    }
  }

  if (graduated) {
    return (
      <div className="rounded-xl border border-pump/40 bg-panel p-5">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎓</span>
          <h3 className="text-lg font-black text-pump">Graduated</h3>
        </div>
        <p className="mt-2 text-sm text-mute">
          The bonding curve is complete — curve trading is disabled.{" "}
          {curve.lpDeployed
            ? "Liquidity has been deployed to the DEX; trade it there."
            : "Liquidity will be deployed to the DEX; until then funds sit escrowed in the factory."}
        </p>
      </div>
    );
  }

  const quoteError = tab === "buy" ? buyQuoteError : sellQuoteError;

  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-panel">
      {/* tabs */}
      <div className="grid grid-cols-2">
        <button
          onClick={() => setTab("buy")}
          className={`py-3 text-sm font-black uppercase tracking-wider transition ${
            tab === "buy"
              ? "bg-pump-dim text-pump shadow-[inset_0_-2px_0_var(--color-pump)]"
              : "bg-panel2 text-mute hover:text-zinc-200"
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setTab("sell")}
          className={`py-3 text-sm font-black uppercase tracking-wider transition ${
            tab === "sell"
              ? "bg-dump-dim text-dump shadow-[inset_0_-2px_0_var(--color-dump)]"
              : "bg-panel2 text-mute hover:text-zinc-200"
          }`}
        >
          Sell
        </button>
      </div>

      <div className="space-y-4 p-4">
        {tab === "buy" ? (
          <>
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-mute">
                  You pay (ETH)
                </span>
              </div>
              <input
                value={buyIn}
                onChange={(e) => setBuyIn(e.target.value)}
                placeholder="0.0"
                inputMode="decimal"
                className="w-full rounded-md border border-edge bg-panel2 px-3 py-2.5 font-mono text-lg text-zinc-100 outline-none placeholder:text-mute/50 focus:border-pump/60"
              />
              <div className="mt-1 flex gap-1.5">
                {["0.01", "0.05", "0.1", "0.5"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setBuyIn(v)}
                    className="rounded border border-edge bg-panel2 px-2 py-0.5 font-mono text-[11px] text-mute transition hover:border-pump/50 hover:text-pump"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <QuoteBox
              rows={
                buyWei && buyQuote
                  ? [
                      [
                        "You receive (est.)",
                        `${formatAmount(buyQuote[0])} ${symbol}`,
                        "text-pump",
                      ],
                      ["ETH used", `${formatEth(buyQuote[1])} ETH`],
                      ["Fee (1%)", `${formatEth(buyQuote[2])} ETH`],
                      [
                        `Min received (${bpsToPct(slippageBps)}% slip)`,
                        `${formatAmount(minTokensOut)} ${symbol}`,
                      ],
                    ]
                  : null
              }
              hint={
                buyIn.trim() && !buyWei
                  ? "Enter a valid ETH amount"
                  : "Quote updates live · partial fills refund unused ETH at graduation"
              }
              error={quoteError ? errMsg(quoteError) : null}
            />
          </>
        ) : (
          <>
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-mute">
                  You sell ({symbol})
                </span>
                {mounted && tokenBalance !== undefined && (
                  <button
                    type="button"
                    onClick={() =>
                      setSellIn(
                        tokenBalance > 0n ? formatEther(tokenBalance) : "",
                      )
                    }
                    className="font-mono text-[11px] text-mute transition hover:text-dump"
                  >
                    Max: {formatAmount(tokenBalance)}
                  </button>
                )}
              </div>
              <input
                value={sellIn}
                onChange={(e) => setSellIn(e.target.value)}
                placeholder="0.0"
                inputMode="decimal"
                className="w-full rounded-md border border-edge bg-panel2 px-3 py-2.5 font-mono text-lg text-zinc-100 outline-none placeholder:text-mute/50 focus:border-dump/60"
              />
            </div>

            <QuoteBox
              rows={
                sellWei && sellQuote
                  ? [
                      [
                        "You receive (est.)",
                        `${formatEth(sellQuote[0])} ETH`,
                        "text-dump",
                      ],
                      ["Fee (1%)", `${formatEth(sellQuote[1])} ETH`],
                      [
                        `Min received (${bpsToPct(slippageBps)}% slip)`,
                        `${formatEth(minEthOut)} ETH`,
                      ],
                    ]
                  : null
              }
              hint={
                sellIn.trim() && !sellWei
                  ? "Enter a valid token amount"
                  : "Quote updates live · requires approval before first sell"
              }
              error={quoteError ? errMsg(quoteError) : null}
            />
          </>
        )}

        {/* slippage */}
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wider text-mute">
            Slippage
          </span>
          <div className="flex items-center gap-1">
            {["0.5", "1", "2", "5"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setSlippage(v)}
                className={`rounded border px-1.5 py-0.5 font-mono text-[11px] transition ${
                  slippage === v
                    ? "border-pump/60 text-pump"
                    : "border-edge text-mute hover:text-zinc-200"
                }`}
              >
                {v}%
              </button>
            ))}
            <input
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              inputMode="decimal"
              className="w-14 rounded border border-edge bg-panel2 px-1.5 py-0.5 text-right font-mono text-[11px] text-zinc-200 outline-none focus:border-pump/50"
              aria-label="Slippage percent"
            />
            <span className="text-mute">%</span>
          </div>
        </div>

        {/* errors / status */}
        {txError && (
          <p className="break-all rounded border border-dump/40 bg-dump-dim/40 p-2 font-mono text-xs text-dump">
            {txError}
          </p>
        )}
        {lastTx && !txError && !busy && (
          <p className="truncate font-mono text-[11px] text-mute">
            Last tx:{" "}
            {explorerUrl ? (
              <a
                href={`${explorerUrl}/tx/${lastTx}`}
                target="_blank"
                rel="noreferrer"
                className="text-pump underline decoration-dotted"
              >
                {lastTx.slice(0, 18)}…
              </a>
            ) : (
              <span>{lastTx.slice(0, 18)}…</span>
            )}
          </p>
        )}

        {/* action button */}
        {!mounted ? (
          <button disabled className={actionCls("buy")}>
            …
          </button>
        ) : !isConnected ? (
          <p className="rounded border border-edge bg-panel2 p-3 text-center text-sm text-mute">
            Connect your wallet to trade.
          </p>
        ) : wrongChain ? (
          <button
            onClick={() => switchChain({ chainId: activeChain.id })}
            disabled={switching}
            className={actionCls(tab)}
          >
            {switching ? "Switching…" : `Switch to ${activeChain.name}`}
          </button>
        ) : tab === "buy" ? (
          <button
            onClick={doBuy}
            disabled={!buyWei || !buyQuote || !!busy}
            className={actionCls("buy")}
          >
            {busy ?? `Buy $${symbol}`}
          </button>
        ) : needsApprove ? (
          <button
            onClick={doApprove}
            disabled={!sellWei || !!busy}
            className={actionCls("sell")}
          >
            {busy ?? `Approve ${symbol}`}
          </button>
        ) : (
          <button
            onClick={doSell}
            disabled={
              !sellWei ||
              !sellQuote ||
              !!busy ||
              (tokenBalance !== undefined &&
                sellWei !== null &&
                sellWei > tokenBalance)
            }
            className={actionCls("sell")}
          >
            {busy ??
              (tokenBalance !== undefined &&
              sellWei !== null &&
              sellWei > tokenBalance
                ? "Insufficient balance"
                : `Sell $${symbol}`)}
          </button>
        )}
      </div>
    </div>
  );
}

function bpsToPct(bps: bigint): string {
  return (Number(bps) / 100).toString();
}

function QuoteBox({
  rows,
  hint,
  error,
}: {
  rows: Array<[string, string, string?]> | null;
  hint: string;
  error: string | null;
}) {
  return (
    <div className="rounded-md border border-edge bg-panel2 p-3">
      {error ? (
        <p className="break-all font-mono text-xs text-dump">{error}</p>
      ) : rows ? (
        <dl className="space-y-1.5">
          {rows.map(([k, v, cls]) => (
            <div key={k} className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-mute">{k}</dt>
              <dd className={`font-mono text-xs ${cls ?? "text-zinc-200"}`}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-mute/70">{hint}</p>
      )}
    </div>
  );
}

function actionCls(kind: "buy" | "sell"): string {
  return kind === "buy"
    ? "w-full rounded-md bg-pump px-4 py-3 text-sm font-black uppercase tracking-wider text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
    : "w-full rounded-md bg-dump px-4 py-3 text-sm font-black uppercase tracking-wider text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";
}
