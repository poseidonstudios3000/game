import hre from "hardhat";
import { parseEther } from "viem";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  if (!deployer) {
    throw new Error(
      "No deployer account available. Set PRIVATE_KEY in the environment for live networks."
    );
  }
  const publicClient = await hre.viem.getPublicClient();

  // `||` not `??`: dotenv yields "" for blank lines in .env, and BigInt("")
  // is 0n — which would deploy an unusable curve — while "" as an address
  // would revert.
  const virtualEthStart = process.env.VIRTUAL_ETH_START
    ? BigInt(process.env.VIRTUAL_ETH_START)
    : parseEther("0.01");
  const feeRecipient = (process.env.FEE_RECIPIENT ||
    deployer.account.address) as `0x${string}`;

  console.log(`Deployer:        ${deployer.account.address}`);
  console.log(`virtualEthStart: ${virtualEthStart} wei`);
  console.log(`feeRecipient:    ${feeRecipient}`);

  const factory = await hre.viem.deployContract("PumpFactory", [
    virtualEthStart,
    feeRecipient,
    deployer.account.address,
  ]);

  const chainId = await publicClient.getChainId();
  console.log(`PumpFactory deployed at ${factory.address} (chainId ${chainId})`);

  const deployment = {
    chainId,
    factory: factory.address,
    virtualEthStart: virtualEthStart.toString(),
    deployedAt: new Date().toISOString(),
  };

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${chainId}.json`);
  fs.writeFileSync(file, JSON.stringify(deployment, null, 2) + "\n");
  console.log(`Wrote ${file}`);

  // Wire the frontend to this deployment (web/.env.local is gitignored;
  // last deploy wins).
  const webEnv = path.join(__dirname, "..", "..", "web", ".env.local");
  fs.writeFileSync(
    webEnv,
    "# auto-written by contracts/scripts/deploy.ts — last deploy wins\n" +
      `NEXT_PUBLIC_CHAIN_ID=${chainId}\n` +
      `NEXT_PUBLIC_FACTORY_ADDRESS=${factory.address}\n`
  );
  console.log(`Wrote ${webEnv} — web app now points at this deployment.`);

  if (chainId === 46630 || chainId === 4663) {
    const net = chainId === 4663 ? "mainnet" : "testnet";
    console.log(
      `\nNext steps:\n` +
        `  verify:  npm run verify:${net} -- ${factory.address} ${virtualEthStart} ${feeRecipient} ${deployer.account.address}\n` +
        `  web:     cd ../web && npm install && npm run dev`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
