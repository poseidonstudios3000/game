# HoodPump — Memecoin Launchpad on Robinhood Chain (Alpha MVP Spec)

A pump.fun-style bonding-curve memecoin launchpad targeting **Robinhood Chain**
(Arbitrum Orbit L2, native gas token: ETH).

## Networks

| Network | Chain ID | RPC | Explorer |
|---|---|---|---|
| Robinhood Chain Mainnet | 4663 | https://rpc.mainnet.chain.robinhood.com | https://robinhoodchain.blockscout.com |
| Robinhood Chain Testnet | 46630 | https://rpc.testnet.chain.robinhood.com | https://explorer.testnet.chain.robinhood.com |
| Local (anvil) | 31337 | http://127.0.0.1:8545 | — |

Testnet faucet: https://faucet.testnet.chain.robinhood.com

## Repo layout

```
contracts/   Hardhat 2 project (contracts/, test/, scripts/) — TS tests via
             @nomicfoundation/hardhat-toolbox-viem; solc 0.8.26 runs as the
             solc-js WASM build from the `solc` npm package (see the
             TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD override in hardhat.config.ts;
             this sandbox cannot download native compilers — DO NOT remove it)
web/         Next.js App Router frontend (TypeScript, Tailwind, wagmi v2 + viem)
SPEC.md      This file — the canonical interface contract
```

## Mechanism (pump.fun-style constant-product curve with virtual reserves)

Every launched token:
- Fixed total supply: `TOTAL_SUPPLY = 1_000_000_000e18` (1B, 18 decimals), fully
  minted to the factory at creation. No further minting, no owner, no blacklist.
- `CURVE_SUPPLY = 800_000_000e18` (80%) is sellable on the bonding curve.
- `LP_RESERVE = 200_000_000e18` (20%) is held back for DEX liquidity at graduation.

Pricing uses constant product over **virtual reserves**:
- Initial virtual token reserve: `VIRTUAL_TOKEN_START = 1_073_000_000e18`
  (curve supply + 273M virtual buffer, mirrors pump.fun ratios).
- Initial virtual ETH reserve: `virtualEthStart` — factory constructor arg
  (immutable). Default for mainnet-style deploy: `1.5 ether`; testnet deploys
  should use something small (e.g. `0.01 ether`) so coins can actually graduate.
- Invariant on each trade: `(virtualEth + Δeth) * (virtualToken - Δtoken) = virtualEth * virtualToken`.
- Spot price = `virtualEth / virtualToken` (ETH per token).
- Total ETH to sell out the curve ≈ `virtualEthStart * 800/273` ≈ `2.93 * virtualEthStart`.

**Fees:** `FEE_BPS = 100` (1%) taken in ETH on both buys (from input) and sells
(from output), accrued to `feeRecipient` (immediately transferred).

**Graduation:** when the curve's real token reserve hits 0 (last buy is
partially filled and excess ETH refunded), the curve is `graduated`: no more
curve trading. The factory then holds `realEth` + `LP_RESERVE` tokens for that
token. Anyone may call `finalizeGraduation(token)` once the owner has set a
UniswapV2-compatible router: it adds liquidity (all realEth + 200M tokens) and
burns the LP tokens to `0xdead`. Until a router is set, funds stay escrowed in
the factory (no owner withdrawal path for curve funds — only fees).

## Contracts (Solidity 0.8.26, OpenZeppelin 5, Hardhat 2)

### `LaunchToken.sol`
Minimal OZ ERC20. Constructor `(string name, string symbol, address recipient)`
mints TOTAL_SUPPLY to `recipient` (the factory). Freely transferable. Nothing else.

### `PumpFactory.sol` (Ownable2Step, ReentrancyGuard)

```solidity
struct Curve {
    address creator;
    uint128 virtualEth;    // virtual ETH reserve
    uint128 virtualToken;  // virtual token reserve
    uint128 realEth;       // ETH held for this curve (excludes fees)
    uint128 realToken;     // tokens still sellable on the curve
    uint64  createdAt;
    bool    graduated;
    bool    lpDeployed;
}

struct TokenMeta {          // name/symbol duplicated from ERC20 for cheap list reads
    string name;
    string symbol;
    string imageUrl;
    string description;
}

struct TokenView {          // read helper for the frontend
    address token;
    Curve curve;
    TokenMeta meta;
}
```

External / public API (exact signatures — frontend codes against these):

```solidity
constructor(uint128 virtualEthStart_, address feeRecipient_, address owner_);

function createToken(
    string calldata name,
    string calldata symbol,
    string calldata imageUrl,
    string calldata description
) external payable returns (address token);
// msg.value > 0 performs an initial creator buy on the fresh curve (fee applies).

function buy(address token, uint256 minTokensOut)
    external payable returns (uint256 tokensOut);
// Partial fill at graduation boundary: unused ETH is refunded.

function sell(address token, uint256 tokenAmount, uint256 minEthOut)
    external returns (uint256 ethOut);
// Pulls tokens via transferFrom (requires prior approve).

function quoteBuy(address token, uint256 ethIn)
    external view returns (uint256 tokensOut, uint256 ethUsed, uint256 fee);
function quoteSell(address token, uint256 tokenAmount)
    external view returns (uint256 ethOut, uint256 fee);

function finalizeGraduation(address token) external;   // anyone, once router set
function setRouter(address router_) external;          // onlyOwner
function setFeeRecipient(address r) external;          // onlyOwner

function tokenCount() external view returns (uint256);
function tokenAt(uint256 i) external view returns (address);
function curves(address token) external view returns (Curve memory);
function tokenMeta(address token) external view returns (TokenMeta memory);
function getTokens(uint256 offset, uint256 limit)
    external view returns (TokenView[] memory);        // newest-first NOT required; frontend sorts
function progressBps(address token) external view returns (uint256);
// tokens sold / CURVE_SUPPLY in basis points, 10000 == graduated

// public constants (also exposed as views):
function TOTAL_SUPPLY() external view returns (uint256);
function CURVE_SUPPLY() external view returns (uint256);
function LP_RESERVE() external view returns (uint256);
function VIRTUAL_TOKEN_START() external view returns (uint256);
function FEE_BPS() external view returns (uint256);
function virtualEthStart() external view returns (uint128);
function feeRecipient() external view returns (address);
function router() external view returns (address);
```

Events (frontend reads these via `getLogs`):

```solidity
event TokenCreated(address indexed token, address indexed creator,
                   string name, string symbol, string imageUrl, string description);
event Trade(address indexed token, address indexed trader, bool isBuy,
            uint256 ethAmount,   // ETH in (buys, pre-fee actually-used) / ETH out (sells, post-fee)
            uint256 tokenAmount,
            uint128 virtualEth, uint128 virtualToken); // post-trade reserves
event Graduated(address indexed token, uint256 realEth);
event LiquidityDeployed(address indexed token, address pair,
                        uint256 ethAmount, uint256 tokenAmount);
```

Rules:
- checks-effects-interactions + `nonReentrant` on createToken/buy/sell/finalizeGraduation.
- Round in the protocol's favor (buyer gets floor, seller gets floor).
- Reject: trades on unknown/graduated tokens, zero-value buys, empty name/symbol.
- `sell` may never make `realEth` negative; cap `ethOut <= realEth` (invariant
  guarantees this mathematically; enforce anyway).
- Fee transfers use `.call`; on failure revert (feeRecipient is protocol-controlled).
- Name ≤ 32 bytes, symbol ≤ 10 bytes, imageUrl ≤ 256, description ≤ 512
  (UTF-8 byte bounds — `bytes(str).length`; clients must validate in bytes,
  not JS string length).

### `scripts/deploy.ts`
Hardhat script (`npx hardhat run scripts/deploy.ts --network robinhoodTestnet`):
reads env `VIRTUAL_ETH_START` (wei, default `0.01 ether`), `FEE_RECIPIENT`
(default deployer), deploys `PumpFactory`, prints the address and writes it to
`deployments/<chainId>.json`.

### Tests (`npx hardhat test`, TypeScript + viem, must pass)
- create → buy → price rises → sell → curve math invariant holds (k constant ± rounding, rounding favors protocol).
- fee accounting exact; feeRecipient balance increases.
- graduation: exact-boundary buy, overshoot buy refunds excess, post-graduation trades revert.
- finalizeGraduation with a mock router; funds escrowed when router unset.
- slippage reverts (minTokensOut / minEthOut), fuzz test buy/sell roundtrip
  never extracts more ETH than deposited (no free money).

## Frontend (`web/`) — Next.js 15 App Router, TS, Tailwind, wagmi v2 + viem

Degen dark theme (near-black bg, green pump / red dump accents). Pages:

1. `/` — grid of coin cards: image, name, $SYMBOL, market cap in ETH
   (spot price × TOTAL_SUPPLY), bonding-curve progress bar (`progressBps`),
   creator (truncated), "graduated" badge. Data: `getTokens` (paginated, sorted
   newest first client-side). Header: connect-wallet button (injected connector),
   "Launch a coin" CTA.
2. `/create` — form (name, symbol, image URL, description, optional initial buy
   in ETH) → `createToken`. On success, parse `TokenCreated` from the receipt
   and route to the coin page.
3. `/coin/[address]` — trade panel: Buy (ETH in, live `quoteBuy`) / Sell (token
   amount in, live `quoteSell`, handles approve-then-sell), 1% fee + slippage
   (default 2%) shown, min-out passed on-chain. Curve progress bar with ETH
   raised vs. graduation target. Recent trades table from `Trade` logs (last
   ~5000 blocks). Token info card. Post-graduation: trading disabled with a
   "graduated" notice.

Chain plumbing (`web/lib/`):
- `chains.ts`: viem chain defs for robinhood (4663), robinhoodTestnet (46630),
  anvil (31337) with the RPC/explorer URLs above.
- Active chain from `NEXT_PUBLIC_CHAIN_ID` (default 46630); factory address from
  `NEXT_PUBLIC_FACTORY_ADDRESS`, with per-chain fallbacks in `addresses.ts`.
- `factoryAbi.ts`: the single ABI module, auto-generated from the compiled
  artifact by `contracts/scripts/export-abi.js` (regenerate after contract
  changes; never hand-edit).
- Poll reads with react-query (`refetchInterval` ~4s). No backend, no indexer.

`npm run build` must pass with zero type errors. No WalletConnect (no project
ID) — injected connector only for alpha.
