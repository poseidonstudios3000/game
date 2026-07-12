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
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
