import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-toolbox-viem";

// This environment cannot reach binaries.soliditylang.org, so we use the
// solc-js (WASM) compiler shipped in the `solc` npm package instead of
// letting Hardhat download a native binary.
const SOLC_VERSION = "0.8.26";

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: any, _hre, runSuper) => {
  if (args.solcVersion === SOLC_VERSION) {
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: SOLC_VERSION,
      longVersion: `${SOLC_VERSION}+npm.soljson`,
    };
  }
  return runSuper(args);
});

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: SOLC_VERSION,
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    robinhoodTestnet: {
      url: process.env.ROBINHOOD_TESTNET_RPC ?? "https://rpc.testnet.chain.robinhood.com",
      chainId: 46630,
      accounts,
    },
    robinhoodMainnet: {
      url: process.env.ROBINHOOD_MAINNET_RPC ?? "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts,
    },
  },
  // Contract verification on the Robinhood Chain Blockscout explorers via
  // hardhat-verify (loaded by hardhat-toolbox-viem). Blockscout accepts any
  // non-empty apiKey string — "blockscout" is the conventional placeholder.
  etherscan: {
    apiKey: {
      robinhoodMainnet: "blockscout",
      robinhoodTestnet: "blockscout",
    },
    customChains: [
      {
        network: "robinhoodMainnet",
        chainId: 4663,
        urls: {
          apiURL: "https://explorer.mainnet.chain.robinhood.com/api",
          browserURL: "https://explorer.mainnet.chain.robinhood.com",
        },
      },
      {
        network: "robinhoodTestnet",
        chainId: 46630,
        urls: {
          apiURL: "https://explorer.testnet.chain.robinhood.com/api",
          browserURL: "https://explorer.testnet.chain.robinhood.com",
        },
      },
    ],
  },
  // Blockscout verification goes through the etherscan-compatible API above;
  // sourcify.dev is unreachable from this project's target flow.
  sourcify: {
    enabled: false,
  },
};

export default config;
