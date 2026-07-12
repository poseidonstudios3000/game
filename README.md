# HoodPump

A pump.fun-style bonding-curve memecoin launchpad on **Robinhood Chain** (Arbitrum Orbit L2, native gas: ETH). **Alpha MVP** — see [Alpha status](#alpha-status--known-limitations) before doing anything with real funds.

Launch a token in one transaction, trade it on a constant-product bonding curve, and when the curve sells out the token "graduates": liquidity gets pushed to a DEX and the LP tokens are burned.

## Architecture

- **`contracts/`** — Hardhat 2, Solidity 0.8.26, OpenZeppelin 5.
  - `PumpFactory.sol` — single contract that manages every curve: token creation, buy/sell, quotes, fees, graduation, LP deployment.
  - `LaunchToken.sol` — minimal OZ ERC20. Fixed supply minted to the factory, no owner, no minting, no blacklist.
- **`web/`** — Next.js 15 App Router, TypeScript, Tailwind, wagmi v2 + viem. Reads directly from the chain (contract views + `Trade` logs). **No backend, no indexer.**

## Bonding curve mechanism

- Every token: fixed **1B supply**. **800M** sellable on the curve, **200M** reserved for DEX liquidity at graduation.
- Constant-product pricing over **virtual reserves**: `(virtualEth + Δeth) * (virtualToken - Δtoken) = k`. Virtual token reserve starts at 1.073B (curve supply + buffer, pump.fun ratios); virtual ETH start is a deploy-time parameter.
- **1% fee** in ETH on buys and sells, paid to the fee recipient.
- Total ETH to sell out a curve ≈ `2.93 × virtualEthStart`.
- **Graduation:** when the curve's real token reserve hits zero (last buy partially filled, excess refunded), curve trading stops. Once a UniswapV2-compatible router is set, anyone can call `finalizeGraduation(token)`: all raised ETH + the 200M reserve become DEX liquidity, and the LP tokens are burned to `0xdead`.

## Networks

| Network | Chain ID | RPC | Explorer |
|---|---|---|---|
| Robinhood Chain Mainnet | 4663 | https://rpc.mainnet.chain.robinhood.com | https://explorer.mainnet.chain.robinhood.com |
| Robinhood Chain Testnet | 46630 | https://rpc.testnet.chain.robinhood.com | https://explorer.testnet.chain.robinhood.com |
| Local (anvil/hardhat) | 31337 | http://127.0.0.1:8545 | — |

Testnet faucet: https://faucet.testnet.chain.robinhood.com

## Quickstart

### Contracts

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat test
```

### Local end-to-end

```bash
# terminal 1
cd contracts && npx hardhat node

# terminal 2
cd contracts && npm run deploy:local   # prints the factory address

# terminal 3
cd web && npm install
NEXT_PUBLIC_CHAIN_ID=31337 NEXT_PUBLIC_FACTORY_ADDRESS=0x... npm run dev
```

### Testnet deploy

```bash
cd contracts
cp .env.example .env      # set PRIVATE_KEY (fund it via the faucet above)
npm run deploy:testnet
```

### Web

```bash
cd web
cp .env.example .env.local   # NEXT_PUBLIC_CHAIN_ID + NEXT_PUBLIC_FACTORY_ADDRESS
npm install
npm run dev
```

## Alpha status & known limitations

- **Contracts are unaudited. Do not use with real funds yet.**
- No indexer — trade history is read from recent logs only (~last 5000 blocks).
- Graduation liquidity requires the owner to set a UniswapV2-compatible router once one is confirmed on Robinhood Chain; until then graduated funds stay escrowed in the factory.
- Injected wallets only (no WalletConnect).
- Token images are user-supplied URLs — expect broken/hostile images.
- "HoodPump" is a working title — check Robinhood trademark implications before any public launch.

## Roadmap

Indexer, price charts, comments, protocol fee switch, audit.
