"use client";

import { useQuery } from "@tanstack/react-query";
import { getAbiItem, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { explorerUrl, factoryAddress } from "@/lib/addresses";
import { POLL_MS, TRADE_LOG_BLOCK_RANGE } from "@/lib/constants";
import { factoryAbi } from "@/lib/factoryAbi";
import { errMsg, formatAmount, formatEth, shortAddr } from "@/lib/format";

const tradeEvent = getAbiItem({ abi: factoryAbi, name: "Trade" });

export function TradesTable({
  token,
  symbol,
}: {
  token: Address;
  symbol: string;
}) {
  const publicClient = usePublicClient();

  const {
    data: trades,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["trades", token, factoryAddress],
    enabled: !!publicClient && !!factoryAddress,
    refetchInterval: POLL_MS,
    queryFn: async () => {
      if (!publicClient || !factoryAddress) return [];
      const latest = await publicClient.getBlockNumber();
      const fromBlock =
        latest > TRADE_LOG_BLOCK_RANGE ? latest - TRADE_LOG_BLOCK_RANGE : 0n;
      const logs = await publicClient.getLogs({
        address: factoryAddress,
        event: tradeEvent,
        args: { token },
        fromBlock,
        toBlock: latest,
      });
      // newest first
      return [...logs].reverse();
    },
  });

  return (
    <section className="rounded-xl border border-edge bg-panel">
      <h3 className="border-b border-edge px-4 py-3 text-xs font-black uppercase tracking-widest text-mute">
        Recent trades{" "}
        <span className="font-mono normal-case">
          (last {TRADE_LOG_BLOCK_RANGE.toString()} blocks)
        </span>
      </h3>

      {error ? (
        <p className="break-all p-4 font-mono text-xs text-dump">
          Failed to load trades: {errMsg(error)}
        </p>
      ) : isLoading || trades === undefined ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-panel2" />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <p className="p-6 text-center text-sm text-mute">
          No trades in the last {TRADE_LOG_BLOCK_RANGE.toString()} blocks.
          Crickets. 🦗
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="border-b border-edge text-[10px] uppercase tracking-wider text-mute">
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Trader</th>
                <th className="px-4 py-2 text-right font-semibold">ETH</th>
                <th className="px-4 py-2 text-right font-semibold">
                  {symbol}
                </th>
                <th className="px-4 py-2 text-right font-semibold">Block</th>
                <th className="px-4 py-2 text-right font-semibold">Tx</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {trades.map((log) => {
                const isBuy = log.args.isBuy ?? false;
                return (
                  <tr
                    key={`${log.transactionHash}-${log.logIndex}`}
                    className="border-b border-edge/50 last:border-0 hover:bg-panel2/50"
                  >
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${
                          isBuy
                            ? "bg-pump-dim text-pump"
                            : "bg-dump-dim text-dump"
                        }`}
                      >
                        {isBuy ? "Buy" : "Sell"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-zinc-300">
                      {log.args.trader ? shortAddr(log.args.trader) : "—"}
                    </td>
                    <td
                      className={`px-4 py-2 text-right ${
                        isBuy ? "text-pump" : "text-dump"
                      }`}
                    >
                      {formatEth(log.args.ethAmount ?? 0n)}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-300">
                      {formatAmount(log.args.tokenAmount ?? 0n)}
                    </td>
                    <td className="px-4 py-2 text-right text-mute">
                      {log.blockNumber?.toString() ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {explorerUrl && log.transactionHash ? (
                        <a
                          href={`${explorerUrl}/tx/${log.transactionHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-mute underline decoration-dotted hover:text-pump"
                        >
                          {log.transactionHash.slice(0, 10)}…
                        </a>
                      ) : (
                        <span className="text-mute">
                          {log.transactionHash?.slice(0, 10) ?? "—"}…
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
