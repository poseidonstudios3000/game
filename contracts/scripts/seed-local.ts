/**
 * Seeds a locally-deployed PumpFactory with demo activity so the frontend has
 * something real to render: three coins, a spread of buys/sells from multiple
 * accounts, and one coin pushed all the way through graduation.
 *
 * Usage: npx hardhat run scripts/seed-local.ts --network localhost
 */
import hre from "hardhat";
import fs from "fs";
import path from "path";
import { parseEther, formatEther } from "viem";

async function main() {
  const chainId = hre.network.config.chainId ?? 31337;
  const dep = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../deployments/${chainId}.json`), "utf8")
  );
  const factory = await hre.viem.getContractAt("PumpFactory", dep.factory);
  const wallets = await hre.viem.getWalletClients();
  const [alice, bob, carol] = wallets;
  const publicClient = await hre.viem.getPublicClient();

  const coins: { name: string; symbol: string; imageUrl: string; description: string }[] = [
    {
      name: "Hood Doge",
      symbol: "HDOGE",
      imageUrl: "https://placehold.co/256x256/22c55e/000?text=HDOGE",
      description: "The people's dog, now trading 24/7 on Robinhood Chain.",
    },
    {
      name: "Feather Cap",
      symbol: "FTHR",
      imageUrl: "https://placehold.co/256x256/f59e0b/000?text=FTHR",
      description: "Light as a feather, cap like a rock.",
    },
    {
      name: "Diamond Beak",
      symbol: "BEAK",
      imageUrl: "https://placehold.co/256x256/8b5cf6/fff?text=BEAK",
      description: "Holds through everything. Never sells. Probably.",
    },
  ];

  const tokenAddrs: `0x${string}`[] = [];
  for (const [i, c] of coins.entries()) {
    const creator = wallets[i % wallets.length];
    const hash = await factory.write.createToken(
      [c.name, c.symbol, c.imageUrl, c.description],
      { value: parseEther("0.0005"), account: creator.account }
    );
    const rcpt = await publicClient.waitForTransactionReceipt({ hash });
    const created = await factory.getEvents.TokenCreated(
      {},
      { fromBlock: rcpt.blockNumber, toBlock: rcpt.blockNumber }
    );
    const token = created[0].args.token!;
    tokenAddrs.push(token);
    console.log(`created ${c.symbol} at ${token}`);
  }

  // Coin 0: active trading from several accounts.
  await factory.write.buy([tokenAddrs[0], 0n], { value: parseEther("0.002"), account: bob.account });
  await factory.write.buy([tokenAddrs[0], 0n], { value: parseEther("0.004"), account: carol.account });
  // Bob takes some profit: sell a third of his stack.
  const token0 = await hre.viem.getContractAt("LaunchToken", tokenAddrs[0]);
  const bobBal = await token0.read.balanceOf([bob.account.address]);
  await token0.write.approve([dep.factory, bobBal / 3n], { account: bob.account });
  await factory.write.sell([tokenAddrs[0], bobBal / 3n, 0n], { account: bob.account });
  await factory.write.buy([tokenAddrs[0], 0n], { value: parseEther("0.001"), account: alice.account });

  // Coin 1: a couple of small buys.
  await factory.write.buy([tokenAddrs[1], 0n], { value: parseEther("0.0008"), account: carol.account });
  await factory.write.buy([tokenAddrs[1], 0n], { value: parseEther("0.0015"), account: alice.account });

  // Coin 2: push through graduation (overshoot; excess refunds).
  await factory.write.buy([tokenAddrs[2], 0n], { value: parseEther("0.05"), account: bob.account });

  for (const t of tokenAddrs) {
    const curve = await factory.read.curves([t]);
    const prog = await factory.read.progressBps([t]);
    console.log(
      `${t} progress=${Number(prog) / 100}% realEth=${formatEther(curve.realEth)} graduated=${curve.graduated}`
    );
  }
  console.log("seeded OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
