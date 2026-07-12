# GOLIVE — HoodPump mainnet launch runbook

Ordered runbook for taking HoodPump live on **Robinhood Chain mainnet (chain id 4663)**.
Execute top to bottom; every step is copy-pasteable. Assumes the repo checked out
at `~/game` with `contracts/` and `web/` dependencies installed (`npm install` in each).

Read [Risks before real money](#risks-before-real-money) before starting.

---

## 0. Prereqs

**Wallet hygiene**

- Generate a **fresh deployer key** used only for this deployment — never a personal key,
  never one that has signed things elsewhere:

  ```bash
  # with foundry installed (or use any offline keygen you trust)
  cast wallet new
  ```

- Use a **separate fee-recipient address** — this account passively accrues the 1% trade
  fee, so it is the honeypot. A **multisig is strongly recommended**, and Safe is
  available on Robinhood Chain: the canonical Safe v1.4.1/v1.5.0 contracts are deployed
  (chain 4663 is marked `canonical` in `safe-global/safe-deployments`) and the official
  Safe Transaction Service for the chain is live. Check the network picker at
  https://app.safe.global; if the web UI doesn't list the chain yet, the Safe CLI/SDK
  works against the live tx-service. Fallback: a dedicated hardware-wallet address,
  not the deployer. (You can rotate later: `setFeeRecipient` is owner-only.)
- The deployer becomes the factory **owner** (`Ownable2Step`) — it controls `setRouter`,
  `setFeeRecipient`, and ownership transfer. Keep its key offline after launch day.

**Bridge ETH to Robinhood Chain**

- Robinhood Chain is an **Arbitrum Orbit L2 with native ETH gas**, parent chain Ethereum
  mainnet. Fund the deployer via the **canonical Arbitrum bridge**:
  https://portal.arbitrum.io/bridge?destinationChain=robinhood-chain&sourceChain=ethereum
  — deposits land in ~10 minutes. Use only the canonical bridge for launch funds
  (beware lookalike "robin bridge" sites surfacing in search results).
- Budget: `PumpFactory` deployment is a single contract creation of **~3.3M gas**
  (measured locally). At Orbit-typical gas prices that is well under 0.005 ETH.
  **Bring ~0.05 ETH** to the deployer: deploy + verification tx-reads + a smoke-test
  coin (tiny initial buy) + later `setRouter`, with comfortable buffer.
- Note the asymmetry: deposits arrive in ~10 minutes; **withdrawals back to Ethereum
  take the ~7-day rollup challenge period** plus an L1 claim tx. Don't over-fund the
  deployer.
- For production frontend RPC, prefer a provider (Alchemy is Robinhood's recommended
  infra partner; QuickNode/dRPC also support the chain) over the rate-limited public
  RPC — set it via `ROBINHOOD_MAINNET_RPC` for scripts and swap the URL in
  `web/lib/chains.ts` for the app.

---

## 1. Dry-run on testnet

Full rehearsal on Robinhood Chain testnet (chain id 46630) first. Faucet:
**https://faucet.testnet.chain.robinhood.com** — fund the deployer address.

**Deploy**

```bash
cd contracts
cp .env.example .env        # then edit:
# PRIVATE_KEY=0x...                 (fresh key, faucet-funded)
# VIRTUAL_ETH_START=10000000000000000   (0.01 ETH — keep it small so coins can graduate)
# FEE_RECIPIENT=                    (empty = defaults to deployer; fine for testnet)
npm run deploy:testnet
```

Prints the factory address, writes it to `contracts/deployments/46630.json`, **and
auto-writes `web/.env.local`** so the web app points at the deployment — then prints
the exact verify command with the right constructor args.

**Verify on testnet Blockscout**

Constructor args must match `scripts/deploy.ts` exactly:
`(uint128 virtualEthStart, address feeRecipient, address owner)` where `owner` is the
**deployer address** and `feeRecipient` defaulted to the deployer if you left it empty.

```bash
npm run verify:testnet -- <FACTORY_ADDRESS> 10000000000000000 <FEE_RECIPIENT> <DEPLOYER_ADDRESS>
```

Confirm the green "Verified" badge at
`https://explorer.testnet.chain.robinhood.com/address/<FACTORY_ADDRESS>`.

**Exercise the full lifecycle via the web app**

```bash
cd ../web
NEXT_PUBLIC_CHAIN_ID=46630 NEXT_PUBLIC_FACTORY_ADDRESS=<FACTORY_ADDRESS> npm run dev
```

With a faucet-funded wallet connected (injected wallet, network = Robinhood testnet):

1. `/create` — launch a coin with a small initial buy (e.g. 0.001 ETH).
2. On the coin page: **buy**, confirm price/progress move; **sell** part
   (approve-then-sell flow), confirm ETH comes back minus 1% fee.
3. **Graduate it**: with `VIRTUAL_ETH_START = 0.01 ETH` the curve sells out after
   ≈ `2.93 × 0.01 ≈ 0.03 ETH` total buys. Buy ~0.035 ETH in one go — the last buy
   partially fills and refunds the excess. Confirm the "graduated" badge and that
   further trades are rejected.
4. Check the coin's `Trade` history renders and explorer links resolve.

Do not proceed to mainnet until every step above worked.

---

## 2. Choose mainnet parameters

**`VIRTUAL_ETH_START`** (immutable after deploy — same for every coin on this factory):

- Graduation raise ≈ **2.93 × virtualEthStart** (exactly `× 800/273`).
- Starting market cap ≈ **virtualEthStart / 1.073** (spot price × 1B supply).

| `VIRTUAL_ETH_START` | env value (wei) | graduation raise | starting market cap |
|---|---|---|---|
| 0.5 ETH | `500000000000000000` | ≈ 1.47 ETH | ≈ 0.47 ETH |
| 1.5 ETH | `1500000000000000000` | ≈ 4.40 ETH | ≈ 1.40 ETH |
| 4 ETH | `4000000000000000000` | ≈ 11.72 ETH | ≈ 3.73 ETH |

Smaller = coins graduate on less ETH and less value sits in any one curve (see Risks).
`1.5 ETH` is the spec's default mainnet-style value; **start smaller** while unaudited.

**`FEE_RECIPIENT`**: the multisig/hardware address from step 0. Do not leave it empty on
mainnet (empty defaults to the deployer).

---

## 3. Deploy + verify on mainnet

```bash
cd contracts
# .env for mainnet:
# PRIVATE_KEY=0x...            (bridged-funded deployer)
# VIRTUAL_ETH_START=<wei from the table above>
# FEE_RECIPIENT=0x...          (multisig / hardware address)
npm run deploy:mainnet
```

Prints the factory address and writes `contracts/deployments/4663.json`.
**Record the address somewhere durable now.**

**Verify** (args = exactly what deploy.ts passed: virtualEthStart wei, feeRecipient, deployer-as-owner):

```bash
npm run verify:mainnet -- <FACTORY_ADDRESS> <VIRTUAL_ETH_START_WEI> <FEE_RECIPIENT> <DEPLOYER_ADDRESS>
```

**Sanity reads** — on
`https://robinhoodchain.blockscout.com/address/<FACTORY_ADDRESS>` open the
**Read Contract** tab (available once verified) and check:

- `tokenCount()` → `0`
- `FEE_BPS()` → `100`
- `virtualEthStart()` → your chosen wei value
- `feeRecipient()` → your fee address
- `owner()` → the deployer

If any read is wrong, stop: redeploy rather than launch on a misconfigured factory
(`virtualEthStart` is immutable).

---

## 4. Frontend to production

Vercel shown; any Node host works the same.

- **Root directory:** `web/`
- **Build command:** `npm run build` (Next.js 15; the repo script already passes `--turbopack`)
- **Environment variables** (build-time — `NEXT_PUBLIC_*` is inlined at build; changing
  them requires a redeploy):

  ```
  NEXT_PUBLIC_CHAIN_ID=4663
  NEXT_PUBLIC_FACTORY_ADDRESS=<FACTORY_ADDRESS>
  ```

- **Domain:** add your domain in Vercel → Project → Domains, point DNS
  (CNAME → `cname.vercel-dns.com`), wait for TLS to issue.

**Production smoke test** (on the live domain, wallet on Robinhood Chain mainnet):

- [ ] Home page loads, shows empty coin grid, wallet connects on chain 4663.
- [ ] Create a **test coin with a tiny initial buy** (e.g. 0.002 ETH) — routes to its page.
- [ ] Buy a small amount; quote ≈ execution; progress bar moves.
- [ ] Sell part of it back (approve → sell); ETH received ≈ quote minus 1% fee.
- [ ] Trade rows appear in the recent-trades table.
- [ ] Explorer links (coin address, tx hashes) open the mainnet Blockscout and resolve.
- [ ] `feeRecipient` balance on the explorer increased by the fees from the above.

---

## 5. Graduation router

Graduated coins are **safe by construction while no router is set**: the curve's raised
ETH plus the 200M LP reserve stay **escrowed in the factory**. There is no owner
withdrawal path for these funds — the only way out is `finalizeGraduation`, which pushes
them into a DEX pool and burns the LP tokens to `0xdead`. So launching before the router
is known is safe; graduated coins simply wait.

**Uniswap v2 is live on Robinhood Chain mainnet.** Per Uniswap's official
deployment registry ([Uniswap/contracts](https://github.com/Uniswap/contracts)
`deployments/4663`, cross-checked against Uniswap's sdk-core and v2-subgraph
configs):

| Contract | Address |
|---|---|
| UniswapV2Router02 (use this for `setRouter`) | `0x89e5db8b5aa49aa85ac63f691524311aeb649eba` |
| UniswapV2Factory | `0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f` |
| WETH9 | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |

⚠️ **Do not copy Uniswap addresses between chains.** Uniswap's deployer reuses
nonce-derived addresses across 2026 chains for *different* contracts (this
router address is the v2 *factory* on at least one other chain), and the
Ethereum-mainnet canonical router does not exist here. Always run the
pre-flight check first — it asserts on-chain that `router.factory()` and
`router.WETH()` match the published deployment:

```bash
cd contracts && npm run check:router          # requires no key; read-only
```

Only if that prints OK:

```bash
# owner-only, from the deployer key:
cast send <FACTORY_ADDRESS> "setRouter(address)" <ROUTER_ADDRESS> \
  --rpc-url https://rpc.mainnet.chain.robinhood.com --private-key $PRIVATE_KEY

# then anyone can finalize each graduated coin:
cast send <FACTORY_ADDRESS> "finalizeGraduation(address)" <TOKEN_ADDRESS> \
  --rpc-url https://rpc.mainnet.chain.robinhood.com --private-key $PRIVATE_KEY
```

No foundry? Use the explorer instead: verified factory page → **Write Contract** →
connect the **owner (deployer) wallet** → `setRouter(router_)`; then `finalizeGraduation(token)`
from any wallet. Test `setRouter` + `finalizeGraduation` on **testnet first** before
touching mainnet — note Uniswap's registry only records the mainnet deployment, so on
testnet deploy your own v2 router or the repo's `MockRouter` and set that.

Sanity: after `setRouter`, the Read tab's `router()` must return the new address; after
each `finalizeGraduation`, look for the `LiquidityDeployed` event and the pair address.

---

## 6. Launch-day ops

- **Fees:** watch the `feeRecipient` balance —
  `https://robinhoodchain.blockscout.com/address/<FEE_RECIPIENT>`. Rising balance
  = trading is happening and fee plumbing works.
- **Factory watchlist:** create a Blockscout account on the explorer and add
  `<FACTORY_ADDRESS>` to your watchlist with email notifications — you'll see every
  create/buy/sell/graduation without running an indexer.
- **Incident plan — know your levers.** The owner **cannot pause trading and cannot
  withdraw curve funds. There is no emergency stop.** That is a deliberate trust feature
  (users' curve ETH can never be rugged by the owner) **and** an ops constraint (neither
  can you intervene if a bug is found). What you *can* do:
  - Take the **frontend** down or disable the create form (site-level, not chain-level).
    The contract stays live for anyone talking to it directly.
  - `setFeeRecipient` (rotate a compromised fee address), `setRouter` (only matters at
    graduation — and **never set it to an unverified/compromised router**; the escrow is
    only as safe as the router you point it at), and 2-step ownership transfer.
  - Communicate: a pinned notice on the site + your social channel is your real
    circuit breaker.
- Keep the deployer key offline except when executing `setRouter`/`setFeeRecipient`.

---

## Risks before real money

- **Unaudited contracts.** Tests pass, but no third-party audit has been done.
  Mitigate exposure structurally: launch with a **small `VIRTUAL_ETH_START`** — the
  graduation raise (≈2.93×) caps how much ETH any single curve can hold, so it is a
  direct per-coin exposure cap. Raise it only via a fresh factory deployment after
  confidence (and ideally an audit) builds.
- **Trademark.** "HoodPump" trades on the Robinhood name. Get a trademark
  check done **before** public launch; be ready to rename (the name only appears in
  frontend copy and repo metadata, not on-chain).
- **Terms of Service / disclaimer page.** Add a ToS + risk-disclaimer page to the web app
  before promoting it: unaudited software, no custody by the operator, memecoins can go
  to zero, jurisdiction restrictions as advised by counsel. Link it from the footer and
  the create form.
- Re-read the "Alpha status & known limitations" section of [README.md](README.md) —
  everything there still applies on mainnet.
