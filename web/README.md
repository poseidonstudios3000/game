# HoodPump — web

Next.js App Router frontend for the HoodPump bonding-curve launchpad
(see `../SPEC.md`). TypeScript, Tailwind, wagmi v2 + viem. Injected wallet
connector only (no WalletConnect). No backend, no indexer — everything is
read straight from the PumpFactory contract with ~4s react-query polling.

## Configure

| Env var | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | `46630` | Active chain: `4663` (Robinhood mainnet), `46630` (Robinhood testnet), `31337` (local anvil/hardhat) |
| `NEXT_PUBLIC_FACTORY_ADDRESS` | — | PumpFactory address; overrides the per-chain defaults in `lib/addresses.ts` (which start empty) |

Without a factory address the app builds and renders a
"factory not deployed on this chain" empty state.

## Run

```bash
npm install
NEXT_PUBLIC_CHAIN_ID=31337 NEXT_PUBLIC_FACTORY_ADDRESS=0x… npm run dev
npm run build   # must pass with zero type errors
```

## Contract integration

`lib/factoryAbi.ts` is the single swappable ABI module — a human-readable
viem `parseAbi` matching SPEC.md exactly. Swap it for the compiler-generated
ABI at integration time; nothing else imports contract signatures.
