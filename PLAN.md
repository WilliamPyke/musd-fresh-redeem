# Plan: unofficial same-block MUSD redeem

Not part of the Mezo `/web` monorepo. Unofficial community tool.

## Problem

`TroveManager.redeemCollateral` rejects a partial unless `_partialRedemptionHintNICR` matches the post-redeem NICR in a ~0.00002% band. Off-chain hints (explorer, mezotools, a script) are computed in block N and mined in N+1. One BTC oracle tick and the tx reverts.

## Approach

Compute hints **inside** the redeem transaction.

1. User deploys `RedeemHelper` once from their wallet (or uses a shared address).
2. User approves the helper for MUSD.
3. User calls `redeem(amount, maxIterations)`.
4. In that tx the helper: `fetchPrice` → `getRedemptionHints` → `findInsertPosition` → `redeemCollateral` → forwards BTC + leftover MUSD to the caller.

Wallet confirm delay does not stale the hints.

## Scope

- Single-file helper, no owner, no upgrade proxy, no sweep.
- Next.js app on Vercel: connect, deploy helper, approve, redeem.
- Mainnet Mezo only (chain 31612).
- Public GitHub repo.

## Out of scope

- TroveManager upgrade
- Official Mezo branding / dapp integration
- Testnet UI
- Sharing custody / relaying txs
