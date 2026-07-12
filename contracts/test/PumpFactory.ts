import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { getAddress, parseEther, parseEventLogs, zeroAddress } from "viem";

// ---------------------------------------------------------------------------
// Reference constants (must mirror the contract)
// ---------------------------------------------------------------------------

const E18 = 10n ** 18n;
const TOTAL_SUPPLY = 1_000_000_000n * E18;
const CURVE_SUPPLY = 800_000_000n * E18;
const LP_RESERVE = 200_000_000n * E18;
const VIRTUAL_TOKEN_START = 1_073_000_000n * E18;
const FEE_BPS = 100n;
const BPS = 10_000n;
const V_ETH_START = parseEther("1");
const DEAD = "0x000000000000000000000000000000000000dEaD" as const;

// ---------------------------------------------------------------------------
// Reference math (mirrors PumpFactory rounding exactly)
// ---------------------------------------------------------------------------

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

function quoteBuyRef(vEth: bigint, vToken: bigint, realToken: bigint, ethIn: bigint) {
  let fee = ceilDiv(ethIn * FEE_BPS, BPS);
  if (fee > ethIn) fee = ethIn;
  const net = ethIn - fee;
  let tokensOut = (vToken * net) / (vEth + net);
  let netUsed: bigint;
  let grossUsed: bigint;
  if (tokensOut >= realToken) {
    tokensOut = realToken;
    netUsed = ceilDiv(vEth * realToken, vToken - realToken);
    fee = ceilDiv(netUsed * FEE_BPS, BPS - FEE_BPS);
    grossUsed = netUsed + fee;
  } else {
    netUsed = net;
    grossUsed = ethIn;
  }
  return { tokensOut, netUsed, grossUsed, fee };
}

function quoteSellRef(vEth: bigint, vToken: bigint, realEth: bigint, amount: bigint) {
  let gross = (vEth * amount) / (vToken + amount);
  if (gross > realEth) gross = realEth;
  let fee = ceilDiv(gross * FEE_BPS, BPS);
  if (fee > gross) fee = gross;
  return { gross, fee, ethOut: gross - fee };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errString(e: any): string {
  let s = "";
  let cur = e;
  for (let i = 0; cur && i < 10; i++) {
    s += `${cur.message ?? String(cur)}\n`;
    cur = cur.cause;
  }
  return s;
}

async function expectRevert(p: Promise<unknown>, match?: string) {
  let reverted = false;
  try {
    await p;
  } catch (e: any) {
    reverted = true;
    if (match) {
      const s = errString(e);
      expect(s, `expected revert reason to include "${match}", got:\n${s}`).to.include(match);
    }
  }
  expect(reverted, `expected revert${match ? ` with ${match}` : ""}`).to.equal(true);
}

async function deployFixture() {
  const [deployer, feeCollector, alice, bob, carol] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();
  const factory = await hre.viem.deployContract("PumpFactory", [
    V_ETH_START,
    feeCollector.account.address,
    deployer.account.address,
  ]);
  const router = await hre.viem.deployContract("MockRouter", []);
  return { deployer, feeCollector, alice, bob, carol, publicClient, factory, router };
}

const META = {
  name: "Doge Wif Hat",
  symbol: "DWH",
  imageUrl: "https://example.com/dwh.png",
  description: "much wow, very hat",
};

async function launch(
  factory: any,
  publicClient: any,
  creator: any,
  value = 0n,
  meta = META
) {
  const hash = await factory.write.createToken(
    [meta.name, meta.symbol, meta.imageUrl, meta.description],
    { value, account: creator.account }
  );
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const created = parseEventLogs({
    abi: factory.abi,
    logs: receipt.logs,
    eventName: "TokenCreated",
  });
  expect(created.length).to.equal(1);
  return { token: (created[0].args as any).token as `0x${string}`, receipt };
}

async function buyTx(
  factory: any,
  publicClient: any,
  buyer: any,
  token: `0x${string}`,
  value: bigint,
  minTokensOut = 0n
) {
  const hash = await factory.write.buy([token, minTokensOut], {
    value,
    account: buyer.account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const trades = parseEventLogs({ abi: factory.abi, logs: receipt.logs, eventName: "Trade" });
  return { receipt, trade: trades[0]?.args as any, gasCost: receipt.gasUsed * receipt.effectiveGasPrice };
}

async function sellTx(
  factory: any,
  publicClient: any,
  seller: any,
  token: `0x${string}`,
  amount: bigint,
  minEthOut = 0n
) {
  const tokenC = await hre.viem.getContractAt("LaunchToken", token);
  const aHash = await tokenC.write.approve([factory.address, amount], {
    account: seller.account,
  });
  const aReceipt = await publicClient.waitForTransactionReceipt({ hash: aHash });
  const hash = await factory.write.sell([token, amount, minEthOut], {
    account: seller.account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const trades = parseEventLogs({ abi: factory.abi, logs: receipt.logs, eventName: "Trade" });
  return {
    receipt,
    trade: trades[0]?.args as any,
    gasCost:
      receipt.gasUsed * receipt.effectiveGasPrice +
      aReceipt.gasUsed * aReceipt.effectiveGasPrice,
  };
}

async function graduateToken(
  factory: any,
  publicClient: any,
  buyer: any,
  token: `0x${string}`
) {
  // Way more than the curve can absorb; excess is refunded.
  await buyTx(factory, publicClient, buyer, token, parseEther("5"));
  const c = await factory.read.curves([token]);
  expect(c.graduated).to.equal(true);
  return c;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PumpFactory", () => {
  describe("deployment", () => {
    it("exposes the spec constants and constructor config", async () => {
      const { factory, feeCollector, deployer } = await loadFixture(deployFixture);
      expect(await factory.read.TOTAL_SUPPLY()).to.equal(TOTAL_SUPPLY);
      expect(await factory.read.CURVE_SUPPLY()).to.equal(CURVE_SUPPLY);
      expect(await factory.read.LP_RESERVE()).to.equal(LP_RESERVE);
      expect(await factory.read.VIRTUAL_TOKEN_START()).to.equal(VIRTUAL_TOKEN_START);
      expect(await factory.read.FEE_BPS()).to.equal(FEE_BPS);
      expect(await factory.read.virtualEthStart()).to.equal(V_ETH_START);
      expect(getAddress(await factory.read.feeRecipient())).to.equal(
        getAddress(feeCollector.account.address)
      );
      expect(await factory.read.router()).to.equal(zeroAddress);
      expect(getAddress(await factory.read.owner())).to.equal(
        getAddress(deployer.account.address)
      );
      expect(await factory.read.tokenCount()).to.equal(0n);
    });

    it("rejects zero virtualEthStart and zero feeRecipient", async () => {
      const { deployer, feeCollector } = await loadFixture(deployFixture);
      await expectRevert(
        hre.viem.deployContract("PumpFactory", [
          0n,
          feeCollector.account.address,
          deployer.account.address,
        ])
      );
      await expectRevert(
        hre.viem.deployContract("PumpFactory", [
          V_ETH_START,
          zeroAddress,
          deployer.account.address,
        ])
      );
    });
  });

  describe("createToken", () => {
    it("launches a token with a fresh curve, mints supply to the factory and emits TokenCreated", async () => {
      const { factory, publicClient, alice } = await loadFixture(deployFixture);
      const { token, receipt } = await launch(factory, publicClient, alice);

      const created = parseEventLogs({
        abi: factory.abi,
        logs: receipt.logs,
        eventName: "TokenCreated",
      });
      const args = created[0].args as any;
      expect(getAddress(args.creator)).to.equal(getAddress(alice.account.address));
      expect(args.name).to.equal(META.name);
      expect(args.symbol).to.equal(META.symbol);
      expect(args.imageUrl).to.equal(META.imageUrl);
      expect(args.description).to.equal(META.description);

      const c = await factory.read.curves([token]);
      expect(getAddress(c.creator)).to.equal(getAddress(alice.account.address));
      expect(c.virtualEth).to.equal(V_ETH_START);
      expect(c.virtualToken).to.equal(VIRTUAL_TOKEN_START);
      expect(c.realEth).to.equal(0n);
      expect(c.realToken).to.equal(CURVE_SUPPLY);
      expect(c.createdAt > 0n).to.equal(true);
      expect(c.graduated).to.equal(false);
      expect(c.lpDeployed).to.equal(false);

      const meta = await factory.read.tokenMeta([token]);
      expect(meta.name).to.equal(META.name);
      expect(meta.symbol).to.equal(META.symbol);
      expect(meta.imageUrl).to.equal(META.imageUrl);
      expect(meta.description).to.equal(META.description);

      const tokenC = await hre.viem.getContractAt("LaunchToken", token);
      expect(await tokenC.read.name()).to.equal(META.name);
      expect(await tokenC.read.symbol()).to.equal(META.symbol);
      expect(await tokenC.read.totalSupply()).to.equal(TOTAL_SUPPLY);
      expect(await tokenC.read.balanceOf([factory.address])).to.equal(TOTAL_SUPPLY);

      expect(await factory.read.tokenCount()).to.equal(1n);
      expect(getAddress(await factory.read.tokenAt([0n]))).to.equal(getAddress(token));
      expect(await factory.read.progressBps([token])).to.equal(0n);
    });

    it("paginates getTokens", async () => {
      const { factory, publicClient, alice, bob } = await loadFixture(deployFixture);
      const t0 = (await launch(factory, publicClient, alice)).token;
      const t1 = (await launch(factory, publicClient, bob, 0n, { ...META, name: "Two", symbol: "TWO" })).token;
      const t2 = (await launch(factory, publicClient, alice, 0n, { ...META, name: "Three", symbol: "THR" })).token;

      const all = await factory.read.getTokens([0n, 10n]);
      expect(all.length).to.equal(3);
      expect(all.map((v: any) => getAddress(v.token))).to.deep.equal(
        [t0, t1, t2].map((t) => getAddress(t))
      );
      expect(all[1].meta.name).to.equal("Two");
      expect(all[1].curve.realToken).to.equal(CURVE_SUPPLY);
      expect(getAddress(all[2].curve.creator)).to.equal(getAddress(alice.account.address));

      const page = await factory.read.getTokens([1n, 1n]);
      expect(page.length).to.equal(1);
      expect(getAddress(page[0].token)).to.equal(getAddress(t1));

      const tail = await factory.read.getTokens([2n, 50n]);
      expect(tail.length).to.equal(1);
      expect(getAddress(tail[0].token)).to.equal(getAddress(t2));

      expect((await factory.read.getTokens([3n, 10n])).length).to.equal(0);
      expect((await factory.read.getTokens([0n, 0n])).length).to.equal(0);
    });

    it("enforces string length bounds", async () => {
      const { factory, alice } = await loadFixture(deployFixture);
      const send = (name: string, symbol: string, img = "", desc = "") =>
        factory.write.createToken([name, symbol, img, desc], { account: alice.account });

      await expectRevert(send("", "SYM"), "InvalidStringLength");
      await expectRevert(send("a".repeat(33), "SYM"), "InvalidStringLength");
      await expectRevert(send("Name", ""), "InvalidStringLength");
      await expectRevert(send("Name", "s".repeat(11)), "InvalidStringLength");
      await expectRevert(send("Name", "SYM", "u".repeat(257)), "InvalidStringLength");
      await expectRevert(send("Name", "SYM", "", "d".repeat(513)), "InvalidStringLength");

      // Boundary lengths are accepted.
      await send("a".repeat(32), "s".repeat(10), "u".repeat(256), "d".repeat(512));
    });

    it("performs a fee-charged dev-buy when created with msg.value", async () => {
      const { factory, publicClient, alice, feeCollector } = await loadFixture(deployFixture);
      const value = parseEther("1");
      const ref = quoteBuyRef(V_ETH_START, VIRTUAL_TOKEN_START, CURVE_SUPPLY, value);
      const feeBefore = await publicClient.getBalance({ address: feeCollector.account.address });

      const { token, receipt } = await launch(factory, publicClient, alice, value);

      const trades = parseEventLogs({ abi: factory.abi, logs: receipt.logs, eventName: "Trade" });
      expect(trades.length).to.equal(1);
      const t = trades[0].args as any;
      expect(getAddress(t.token)).to.equal(getAddress(token));
      expect(getAddress(t.trader)).to.equal(getAddress(alice.account.address));
      expect(t.isBuy).to.equal(true);
      expect(t.ethAmount).to.equal(value); // full fill: all of msg.value used
      expect(t.tokenAmount).to.equal(ref.tokensOut);

      const tokenC = await hre.viem.getContractAt("LaunchToken", token);
      expect(await tokenC.read.balanceOf([alice.account.address])).to.equal(ref.tokensOut);

      const c = await factory.read.curves([token]);
      expect(c.realEth).to.equal(ref.netUsed);
      expect(c.realToken).to.equal(CURVE_SUPPLY - ref.tokensOut);
      expect(c.virtualEth).to.equal(V_ETH_START + ref.netUsed);
      expect(c.virtualToken).to.equal(VIRTUAL_TOKEN_START - ref.tokensOut);
      expect(t.virtualEth).to.equal(c.virtualEth);
      expect(t.virtualToken).to.equal(c.virtualToken);

      const feeAfter = await publicClient.getBalance({ address: feeCollector.account.address });
      expect(feeAfter - feeBefore).to.equal(ref.fee);
      expect(await publicClient.getBalance({ address: factory.address })).to.equal(ref.netUsed);
    });

    it("dev-buy large enough to graduate the fresh curve refunds the excess", async () => {
      const { factory, publicClient, alice } = await loadFixture(deployFixture);
      const value = parseEther("10");
      const ref = quoteBuyRef(V_ETH_START, VIRTUAL_TOKEN_START, CURVE_SUPPLY, value);
      expect(ref.tokensOut).to.equal(CURVE_SUPPLY);
      expect(ref.grossUsed < value).to.equal(true);

      const balBefore = await publicClient.getBalance({ address: alice.account.address });
      const { token, receipt } = await launch(factory, publicClient, alice, value);
      const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
      const balAfter = await publicClient.getBalance({ address: alice.account.address });

      expect(balBefore - balAfter).to.equal(ref.grossUsed + gasCost);

      const c = await factory.read.curves([token]);
      expect(c.graduated).to.equal(true);
      expect(c.realToken).to.equal(0n);
      const grads = parseEventLogs({ abi: factory.abi, logs: receipt.logs, eventName: "Graduated" });
      expect(grads.length).to.equal(1);
      expect((grads[0].args as any).realEth).to.equal(c.realEth);
    });
  });

  describe("buy", () => {
    it("rejects unknown tokens and zero-value buys", async () => {
      const { factory, publicClient, alice, bob } = await loadFixture(deployFixture);
      await expectRevert(
        factory.write.buy([bob.account.address, 0n], {
          value: parseEther("1"),
          account: alice.account,
        }),
        "UnknownToken"
      );
      const { token } = await launch(factory, publicClient, alice);
      await expectRevert(
        factory.write.buy([token, 0n], { value: 0n, account: alice.account }),
        "ZeroValue"
      );
      // 1 wei is swallowed by the fee -> zero tokens out -> revert
      await expectRevert(
        factory.write.buy([token, 0n], { value: 1n, account: alice.account }),
        "ZeroAmount"
      );
    });

    it("matches quoteBuy / reference math exactly and pays the fee to feeRecipient", async () => {
      const { factory, publicClient, alice, bob, feeCollector } = await loadFixture(deployFixture);
      const { token } = await launch(factory, publicClient, alice);
      const tokenC = await hre.viem.getContractAt("LaunchToken", token);

      const value = parseEther("0.37");
      const c0 = await factory.read.curves([token]);
      const ref = quoteBuyRef(c0.virtualEth, c0.virtualToken, c0.realToken, value);
      const [qOut, qUsed, qFee] = await factory.read.quoteBuy([token, value]);
      expect(qOut).to.equal(ref.tokensOut);
      expect(qUsed).to.equal(value);
      expect(qFee).to.equal(ref.fee);
      expect(qFee).to.equal(ceilDiv(value * FEE_BPS, BPS));

      const feeBefore = await publicClient.getBalance({ address: feeCollector.account.address });
      const { trade } = await buyTx(factory, publicClient, bob, token, value);
      const feeAfter = await publicClient.getBalance({ address: feeCollector.account.address });

      expect(await tokenC.read.balanceOf([bob.account.address])).to.equal(ref.tokensOut);
      expect(feeAfter - feeBefore).to.equal(ref.fee);
      expect(trade.ethAmount).to.equal(value);
      expect(trade.tokenAmount).to.equal(ref.tokensOut);
      expect(trade.isBuy).to.equal(true);

      const c1 = await factory.read.curves([token]);
      expect(c1.virtualEth).to.equal(c0.virtualEth + ref.netUsed);
      expect(c1.virtualToken).to.equal(c0.virtualToken - ref.tokensOut);
      expect(c1.realEth).to.equal(ref.netUsed);
      expect(c1.realToken).to.equal(CURVE_SUPPLY - ref.tokensOut);
      // Factory escrow holds exactly realEth (fees already forwarded).
      expect(await publicClient.getBalance({ address: factory.address })).to.equal(c1.realEth);
    });

    it("price rises with each buy", async () => {
      const { factory, publicClient, alice, bob } = await loadFixture(deployFixture);
      const { token } = await launch(factory, publicClient, alice);

      const value = parseEther("0.5");
      const c0 = await factory.read.curves([token]);
      const spot0 = (c0.virtualEth * E18) / c0.virtualToken;
      const { trade: t1 } = await buyTx(factory, publicClient, bob, token, value);
      const c1 = await factory.read.curves([token]);
      const spot1 = (c1.virtualEth * E18) / c1.virtualToken;
      const { trade: t2 } = await buyTx(factory, publicClient, bob, token, value);
      const c2 = await factory.read.curves([token]);
      const spot2 = (c2.virtualEth * E18) / c2.virtualToken;

      expect(t2.tokenAmount < t1.tokenAmount).to.equal(true);
      expect(spot1 > spot0).to.equal(true);
      expect(spot2 > spot1).to.equal(true);
      expect(await factory.read.progressBps([token])).to.equal(
        ((CURVE_SUPPLY - c2.realToken) * BPS) / CURVE_SUPPLY
      );
    });

    it("enforces minTokensOut slippage protection", async () => {
      const { factory, publicClient, alice, bob } = await loadFixture(deployFixture);
      const { token } = await launch(factory, publicClient, alice);
      const value = parseEther("0.2");
      const [qOut] = await factory.read.quoteBuy([token, value]);

      await expectRevert(
        factory.write.buy([token, qOut + 1n], { value, account: bob.account }),
        "SlippageExceeded"
      );
      // Exactly the quoted amount passes.
      await buyTx(factory, publicClient, bob, token, value, qOut);
      const tokenC = await hre.viem.getContractAt("LaunchToken", token);
      expect(await tokenC.read.balanceOf([bob.account.address])).to.equal(qOut);
    });

    it("keeps k = virtualEth * virtualToken non-decreasing (rounding favors protocol)", async () => {
      const { factory, publicClient, alice, bob } = await loadFixture(deployFixture);
      const { token } = await launch(factory, publicClient, alice);
      const tokenC = await hre.viem.getContractAt("LaunchToken", token);

      let prev = await factory.read.curves([token]);
      let k = prev.virtualEth * prev.virtualToken;

      const steps: Array<["buy", bigint] | ["sell", bigint]> = [
        ["buy", parseEther("0.11")],
        ["buy", parseEther("0.777")],
        ["sell", 3n], // fraction of balance: 1/3
        ["buy", parseEther("0.05")],
        ["sell", 2n], // 1/2
        ["buy", parseEther("1.23456789")],
        ["sell", 1n], // all
      ];

      for (const [kind, arg] of steps) {
        if (kind === "buy") {
          await buyTx(factory, publicClient, bob, token, arg);
        } else {
          const bal = await tokenC.read.balanceOf([bob.account.address]);
          const amount = bal / arg;
          if (amount === 0n) continue;
          await sellTx(factory, publicClient, bob, token, amount);
        }
        const c = await factory.read.curves([token]);
        const k2 = c.virtualEth * c.virtualToken;
        expect(k2 >= k, "k must never decrease").to.equal(true);
        // ...but only by rounding dust, never by a real amount.
        expect(k2 - k <= k / 10n ** 12n, "k drift exceeds rounding dust").to.equal(true);
        k = k2;
        // virtualEth - virtualEthStart always equals realEth
        expect(c.virtualEth - V_ETH_START).to.equal(c.realEth);
      }
    });
  });

  describe("sell", () => {
    it("rejects unknown token, zero amount and missing approval", async () => {
      const { factory, publicClient, alice, bob } = await loadFixture(deployFixture);
      await expectRevert(
        factory.write.sell([bob.account.address, 1n, 0n], { account: alice.account }),
        "UnknownToken"
      );
      const { token } = await launch(factory, publicClient, alice);
      await expectRevert(
        factory.write.sell([token, 0n, 0n], { account: alice.account }),
        "ZeroAmount"
      );
      await buyTx(factory, publicClient, bob, token, parseEther("0.5"));
      // no approve
      await expectRevert(
        factory.write.sell([token, 1000n, 0n], { account: bob.account }),
        "ERC20InsufficientAllowance"
      );
    });

    it("matches quoteSell / reference math exactly, pays fee, updates reserves", async () => {
      const { factory, publicClient, alice, bob, feeCollector } = await loadFixture(deployFixture);
      const { token } = await launch(factory, publicClient, alice);
      const tokenC = await hre.viem.getContractAt("LaunchToken", token);

      await buyTx(factory, publicClient, bob, token, parseEther("1"));
      const bal = await tokenC.read.balanceOf([bob.account.address]);
      const sellAmount = bal / 3n;

      const c0 = await factory.read.curves([token]);
      const ref = quoteSellRef(c0.virtualEth, c0.virtualToken, c0.realEth, sellAmount);
      const [qOut, qFee] = await factory.read.quoteSell([token, sellAmount]);
      expect(qOut).to.equal(ref.ethOut);
      expect(qFee).to.equal(ref.fee);

      const feeBefore = await publicClient.getBalance({ address: feeCollector.account.address });
      const ethBefore = await publicClient.getBalance({ address: bob.account.address });
      const { trade, gasCost } = await sellTx(factory, publicClient, bob, token, sellAmount);
      const ethAfter = await publicClient.getBalance({ address: bob.account.address });
      const feeAfter = await publicClient.getBalance({ address: feeCollector.account.address });

      expect(ethAfter - ethBefore).to.equal(ref.ethOut - gasCost);
      expect(feeAfter - feeBefore).to.equal(ref.fee);
      expect(trade.isBuy).to.equal(false);
      expect(trade.ethAmount).to.equal(ref.ethOut); // post-fee ETH out per spec
      expect(trade.tokenAmount).to.equal(sellAmount);

      const c1 = await factory.read.curves([token]);
      expect(c1.virtualEth).to.equal(c0.virtualEth - ref.gross);
      expect(c1.virtualToken).to.equal(c0.virtualToken + sellAmount);
      expect(c1.realEth).to.equal(c0.realEth - ref.gross);
      expect(c1.realToken).to.equal(c0.realToken + sellAmount);
      expect(await tokenC.read.balanceOf([bob.account.address])).to.equal(bal - sellAmount);
      expect(await tokenC.read.balanceOf([factory.address])).to.equal(
        TOTAL_SUPPLY - (CURVE_SUPPLY - c1.realToken)
      );
      expect(await publicClient.getBalance({ address: factory.address })).to.equal(c1.realEth);
    });

    it("enforces minEthOut slippage protection", async () => {
      const { factory, publicClient, alice, bob } = await loadFixture(deployFixture);
      const { token } = await launch(factory, publicClient, alice);
      const tokenC = await hre.viem.getContractAt("LaunchToken", token);
      await buyTx(factory, publicClient, bob, token, parseEther("0.4"));
      const bal = await tokenC.read.balanceOf([bob.account.address]);
      const [qOut] = await factory.read.quoteSell([token, bal]);

      await tokenC.write.approve([factory.address, bal], { account: bob.account });
      await expectRevert(
        factory.write.sell([token, bal, qOut + 1n], { account: bob.account }),
        "SlippageExceeded"
      );
      // exact min passes
      await factory.write.sell([token, bal, qOut], { account: bob.account });
      expect(await tokenC.read.balanceOf([bob.account.address])).to.equal(0n);
    });

    it("selling everything back never drains more than realEth (protocol keeps the dust)", async () => {
      const { factory, publicClient, alice, bob } = await loadFixture(deployFixture);
      const { token } = await launch(factory, publicClient, alice);
      const tokenC = await hre.viem.getContractAt("LaunchToken", token);

      await buyTx(factory, publicClient, bob, token, parseEther("2"));
      const bal = await tokenC.read.balanceOf([bob.account.address]);
      await sellTx(factory, publicClient, bob, token, bal);

      const c = await factory.read.curves([token]);
      expect(c.realToken).to.equal(CURVE_SUPPLY);
      // realEth never goes negative; leftover dust stays with the curve.
      expect(c.realEth >= 0n).to.equal(true);
      expect(await publicClient.getBalance({ address: factory.address })).to.equal(c.realEth);
    });
  });

  describe("graduation", () => {
    it("graduates on an exact-boundary buy (crossing buy pays exactly what is needed)", async () => {
      const { factory, publicClient, alice, bob, carol } = await loadFixture(deployFixture);
      const { token } = await launch(factory, publicClient, alice);
      // Uneven prior state.
      await buyTx(factory, publicClient, bob, token, parseEther("1.234567"));

      const c0 = await factory.read.curves([token]);
      const R = c0.realToken;
      const u = ceilDiv(c0.virtualEth * R, c0.virtualToken - R);
      const p = ceilDiv(u * FEE_BPS, BPS - FEE_BPS);

      // Find the smallest msg.value that fully fills the curve.
      let g: bigint | null = null;
      let used = 0n;
      for (let cand = u + p; cand <= u + p + 4n; cand++) {
        const [qOut, qUsed] = await factory.read.quoteBuy([token, cand]);
        if (qOut === R) {
          g = cand;
          used = qUsed;
          break;
        }
      }
      expect(g, "no graduating value found near the analytic boundary").to.not.equal(null);
      expect(used <= g!).to.equal(true);
      expect(g! - used <= 4n, "refund at exact boundary must be dust").to.equal(true);

      const balBefore = await publicClient.getBalance({ address: carol.account.address });
      const { receipt, trade } = await buyTx(factory, publicClient, carol, token, g!);
      const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
      const balAfter = await publicClient.getBalance({ address: carol.account.address });

      // Buyer paid exactly the used amount; any boundary dust was refunded.
      expect(balBefore - balAfter).to.equal(used + gasCost);
      expect(trade.ethAmount).to.equal(used);
      expect(trade.tokenAmount).to.equal(R);

      const c1 = await factory.read.curves([token]);
      expect(c1.graduated).to.equal(true);
      expect(c1.realToken).to.equal(0n);
      expect(c1.virtualToken).to.equal(c0.virtualToken - R);
      expect(await factory.read.progressBps([token])).to.equal(10_000n);

      const grads = parseEventLogs({ abi: factory.abi, logs: receipt.logs, eventName: "Graduated" });
      expect(grads.length).to.equal(1);
      expect((grads[0].args as any).realEth).to.equal(c1.realEth);

      const tokenC = await hre.viem.getContractAt("LaunchToken", token);
      expect(await tokenC.read.balanceOf([carol.account.address])).to.equal(R);
      // Factory keeps exactly LP_RESERVE tokens + realEth ETH in escrow.
      expect(await tokenC.read.balanceOf([factory.address])).to.equal(LP_RESERVE);
      expect(await publicClient.getBalance({ address: factory.address })).to.equal(c1.realEth);
    });

    it("refunds the excess on an overshooting crossing buy", async () => {
      const { factory, publicClient, alice, bob } = await loadFixture(deployFixture);
      const { token } = await launch(factory, publicClient, alice);
      await buyTx(factory, publicClient, bob, token, parseEther("0.9"));

      const value = parseEther("50"); // massive overshoot
      const c0 = await factory.read.curves([token]);
      const [qOut, qUsed, qFee] = await factory.read.quoteBuy([token, value]);
      const ref = quoteBuyRef(c0.virtualEth, c0.virtualToken, c0.realToken, value);
      expect(qOut).to.equal(c0.realToken);
      expect(qUsed).to.equal(ref.grossUsed);
      expect(qFee).to.equal(ref.fee);
      expect(qUsed < value).to.equal(true);
      expect(qUsed).to.equal(ref.netUsed + ref.fee);

      const balBefore = await publicClient.getBalance({ address: bob.account.address });
      const { receipt, trade } = await buyTx(factory, publicClient, bob, token, value);
      const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
      const balAfter = await publicClient.getBalance({ address: bob.account.address });

      expect(balBefore - balAfter).to.equal(qUsed + gasCost); // ~46+ ETH refunded
      expect(trade.ethAmount).to.equal(qUsed);

      const c1 = await factory.read.curves([token]);
      expect(c1.graduated).to.equal(true);
      expect(c1.realEth).to.equal(c0.realEth + ref.netUsed);
    });

    it("rejects all trading and quoting after graduation", async () => {
      const { factory, publicClient, alice, bob } = await loadFixture(deployFixture);
      const { token } = await launch(factory, publicClient, alice);
      const tokenC = await hre.viem.getContractAt("LaunchToken", token);
      await graduateToken(factory, publicClient, bob, token);

      await expectRevert(
        factory.write.buy([token, 0n], { value: parseEther("0.1"), account: bob.account }),
        "AlreadyGraduated"
      );
      await tokenC.write.approve([factory.address, 1000n], { account: bob.account });
      await expectRevert(
        factory.write.sell([token, 1000n, 0n], { account: bob.account }),
        "AlreadyGraduated"
      );
      await expectRevert(factory.read.quoteBuy([token, parseEther("1")]), "AlreadyGraduated");
      await expectRevert(factory.read.quoteSell([token, 1000n]), "AlreadyGraduated");
    });
  });

  describe("finalizeGraduation", () => {
    it("escrows funds until a router is set, then deploys liquidity and burns LP", async () => {
      const { factory, publicClient, deployer, alice, bob, carol, router } =
        await loadFixture(deployFixture);
      const { token } = await launch(factory, publicClient, alice);
      const tokenC = await hre.viem.getContractAt("LaunchToken", token);
      const cGrad = await graduateToken(factory, publicClient, bob, token);
      const realEth = cGrad.realEth;
      expect(realEth > 0n).to.equal(true);

      // Escrow: no router yet -> revert, funds stay put. No withdrawal path exists.
      await expectRevert(
        factory.write.finalizeGraduation([token], { account: carol.account }),
        "RouterNotSet"
      );
      expect(await publicClient.getBalance({ address: factory.address })).to.equal(realEth);
      expect(await tokenC.read.balanceOf([factory.address])).to.equal(LP_RESERVE);

      // Only the owner may set the router.
      await expectRevert(
        factory.write.setRouter([router.address], { account: alice.account }),
        "OwnableUnauthorizedAccount"
      );
      await factory.write.setRouter([router.address], { account: deployer.account });
      expect(getAddress(await factory.read.router())).to.equal(getAddress(router.address));

      // Anyone can finalize.
      const hash = await factory.write.finalizeGraduation([token], { account: carol.account });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      const mockFactoryAddr = await router.read.factory();
      const weth = await router.read.WETH();
      const mockFactory = await hre.viem.getContractAt("MockUniswapV2Factory", mockFactoryAddr);
      const pair = await mockFactory.read.getPair([token, weth]);
      expect(pair).to.not.equal(zeroAddress);

      const deployed = parseEventLogs({
        abi: factory.abi,
        logs: receipt.logs,
        eventName: "LiquidityDeployed",
      });
      expect(deployed.length).to.equal(1);
      const args = deployed[0].args as any;
      expect(getAddress(args.token)).to.equal(getAddress(token));
      expect(getAddress(args.pair)).to.equal(getAddress(pair));
      expect(args.ethAmount).to.equal(realEth);
      expect(args.tokenAmount).to.equal(LP_RESERVE);

      // All escrowed assets moved into the pair.
      expect(await tokenC.read.balanceOf([pair])).to.equal(LP_RESERVE);
      expect(await publicClient.getBalance({ address: pair })).to.equal(realEth);
      expect(await tokenC.read.balanceOf([factory.address])).to.equal(0n);
      expect(await publicClient.getBalance({ address: factory.address })).to.equal(0n);

      // LP tokens burned to 0xdead.
      const pairC = await hre.viem.getContractAt("MockPair", pair);
      const deadLp = await pairC.read.balanceOf([DEAD]);
      expect(deadLp > 0n).to.equal(true);
      expect(await pairC.read.totalSupply()).to.equal(deadLp);

      const c = await factory.read.curves([token]);
      expect(c.lpDeployed).to.equal(true);
      expect(c.realEth).to.equal(0n);

      // Re-finalizing is impossible.
      await expectRevert(
        factory.write.finalizeGraduation([token], { account: carol.account }),
        "AlreadyFinalized"
      );
    });

    it("rejects finalize for unknown or non-graduated tokens", async () => {
      const { factory, publicClient, deployer, alice, bob, router } =
        await loadFixture(deployFixture);
      await factory.write.setRouter([router.address], { account: deployer.account });
      await expectRevert(
        factory.write.finalizeGraduation([bob.account.address], { account: alice.account }),
        "UnknownToken"
      );
      const { token } = await launch(factory, publicClient, alice);
      await expectRevert(
        factory.write.finalizeGraduation([token], { account: alice.account }),
        "NotGraduated"
      );
    });

    it("keeps per-token escrow independent across multiple tokens", async () => {
      const { factory, publicClient, deployer, alice, bob, router } =
        await loadFixture(deployFixture);
      const a = (await launch(factory, publicClient, alice)).token;
      const b = (
        await launch(factory, publicClient, bob, 0n, { ...META, name: "Second", symbol: "SEC" })
      ).token;

      await graduateToken(factory, publicClient, bob, a);
      await buyTx(factory, publicClient, alice, b, parseEther("0.5"));

      const ca = await factory.read.curves([a]);
      const cb = await factory.read.curves([b]);
      expect(await publicClient.getBalance({ address: factory.address })).to.equal(
        ca.realEth + cb.realEth
      );

      await factory.write.setRouter([router.address], { account: deployer.account });
      await factory.write.finalizeGraduation([a], { account: alice.account });

      // Token B's escrow is untouched.
      expect(await publicClient.getBalance({ address: factory.address })).to.equal(cb.realEth);
      const cb2 = await factory.read.curves([b]);
      expect(cb2.realEth).to.equal(cb.realEth);
      expect(cb2.graduated).to.equal(false);
    });
  });

  describe("admin", () => {
    it("setFeeRecipient: onlyOwner, non-zero, takes effect on the next trade", async () => {
      const { factory, publicClient, deployer, alice, bob, carol } =
        await loadFixture(deployFixture);
      await expectRevert(
        factory.write.setFeeRecipient([carol.account.address], { account: alice.account }),
        "OwnableUnauthorizedAccount"
      );
      await expectRevert(
        factory.write.setFeeRecipient([zeroAddress], { account: deployer.account }),
        "ZeroAddress"
      );
      await factory.write.setFeeRecipient([carol.account.address], {
        account: deployer.account,
      });
      expect(getAddress(await factory.read.feeRecipient())).to.equal(
        getAddress(carol.account.address)
      );

      const { token } = await launch(factory, publicClient, alice);
      const value = parseEther("1");
      const before = await publicClient.getBalance({ address: carol.account.address });
      await buyTx(factory, publicClient, bob, token, value);
      const after = await publicClient.getBalance({ address: carol.account.address });
      expect(after - before).to.equal(ceilDiv(value * FEE_BPS, BPS));
    });
  });

  describe("fuzz: buy/sell roundtrips never extract more ETH than deposited", () => {
    it("conserves ETH exactly: deposited - withdrawn == realEth + fees", async function () {
      this.timeout(180_000);
      const [deployer, feeCollector, alice] = await hre.viem.getWalletClients();
      const publicClient = await hre.viem.getPublicClient();
      // Large virtual ETH so the fuzz run never graduates.
      const factory = await hre.viem.deployContract("PumpFactory", [
        parseEther("1000"),
        feeCollector.account.address,
        deployer.account.address,
      ]);
      const { token } = await launch(factory, publicClient, alice);
      const tokenC = await hre.viem.getContractAt("LaunchToken", token);

      // Deterministic pseudo-random LCG.
      let seed = 0xdeadbeefn;
      const rand = () => {
        seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n;
        return seed;
      };

      const feeStart = await publicClient.getBalance({ address: feeCollector.account.address });
      let deposited = 0n;
      let withdrawn = 0n;
      let k = (await factory.read.curves([token])).virtualEth * VIRTUAL_TOKEN_START;

      for (let i = 0; i < 40; i++) {
        const r = rand();
        const bal = await tokenC.read.balanceOf([alice.account.address]);
        if (r % 3n === 0n && bal > 0n) {
          // sell a pseudo-random fraction (1/1000 .. all) of the holdings
          const amount = (bal * ((r % 1000n) + 1n)) / 1000n;
          if (amount === 0n) continue;
          const { trade } = await sellTx(factory, publicClient, alice, token, amount);
          withdrawn += trade.ethAmount;
        } else {
          // buy between 0.05 and ~2.05 ETH
          const value = parseEther("0.05") + (r % parseEther("2"));
          const { trade } = await buyTx(factory, publicClient, alice, token, value);
          deposited += trade.ethAmount; // pre-fee actually-used ETH
        }

        const c = await factory.read.curves([token]);
        expect(c.graduated).to.equal(false);
        const k2 = c.virtualEth * c.virtualToken;
        expect(k2 >= k, `k decreased at iteration ${i}`).to.equal(true);
        k = k2;
        // Factory can always cover its book.
        expect(await publicClient.getBalance({ address: factory.address })).to.equal(c.realEth);
      }

      // Unwind everything.
      const bal = await tokenC.read.balanceOf([alice.account.address]);
      if (bal > 0n) {
        const { trade } = await sellTx(factory, publicClient, alice, token, bal);
        withdrawn += trade.ethAmount;
      }

      const c = await factory.read.curves([token]);
      const feesPaid =
        (await publicClient.getBalance({ address: feeCollector.account.address })) - feeStart;

      // No free money: you can never take out more than you put in.
      expect(withdrawn < deposited).to.equal(true);
      // Exact conservation: every deposited wei is either fees, curve escrow, or paid back out.
      expect(deposited - withdrawn).to.equal(c.realEth + feesPaid);
      expect(c.realToken).to.equal(CURVE_SUPPLY);
    });
  });
});
