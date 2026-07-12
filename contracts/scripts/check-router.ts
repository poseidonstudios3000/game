/**
 * Pre-flight check for the graduation router. Run BEFORE calling setRouter:
 *
 *   npm run check:router                     # checks the known Uniswap router
 *   ROUTER=0x... npm run check:router        # checks a different address
 *
 * Verifies on-chain that the address is a UniswapV2-style router whose
 * factory() and WETH() match Uniswap's published Robinhood Chain deployment.
 * Uniswap's deployer reuses nonce-derived addresses across chains for
 * DIFFERENT contracts (e.g. this router address is the v2 *factory* on other
 * chains), so never skip this check when copying addresses around.
 *
 * Expected values source: github.com/Uniswap/contracts deployments/4663
 * (cross-checked against Uniswap/sdks and Uniswap/v2-subgraph configs).
 */
import hre from "hardhat";
import { getAddress } from "viem";

// Uniswap v2 on Robinhood Chain mainnet (chain id 4663).
const KNOWN_V2_ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";
const EXPECTED_V2_FACTORY = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f";
const EXPECTED_WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

const routerAbi = [
  {
    type: "function",
    name: "factory",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "WETH",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

async function main() {
  const router = getAddress(process.env.ROUTER || KNOWN_V2_ROUTER);
  const publicClient = await hre.viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  console.log(`Chain:  ${chainId}`);
  console.log(`Router: ${router}`);

  const code = await publicClient.getCode({ address: router });
  if (!code || code === "0x") {
    throw new Error("No contract code at this address on this chain.");
  }

  const [factory, weth] = await Promise.all([
    publicClient.readContract({ address: router, abi: routerAbi, functionName: "factory" }),
    publicClient.readContract({ address: router, abi: routerAbi, functionName: "WETH" }),
  ]);
  console.log(`router.factory() = ${factory}`);
  console.log(`router.WETH()    = ${weth}`);

  if (chainId === 4663) {
    const factoryOk = getAddress(factory) === getAddress(EXPECTED_V2_FACTORY);
    const wethOk = getAddress(weth) === getAddress(EXPECTED_WETH);
    if (!factoryOk || !wethOk) {
      throw new Error(
        `Mismatch vs Uniswap's published Robinhood Chain deployment ` +
          `(expected factory ${EXPECTED_V2_FACTORY}, WETH ${EXPECTED_WETH}). ` +
          `Do NOT set this router.`
      );
    }
    console.log("\nOK — matches Uniswap's published Robinhood Chain v2 deployment.");
  } else {
    console.log(
      "\nNon-mainnet chain: factory()/WETH() responded like a v2 router, " +
        "but there are no published reference addresses to compare against — verify manually."
    );
  }
  console.log(
    `Next step (factory owner): call setRouter(${router}) on your PumpFactory, ` +
      `then anyone can finalizeGraduation(token) for graduated coins.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
