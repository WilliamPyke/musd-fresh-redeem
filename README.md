# Fresh Redeem (unofficial)

Unofficial same-transaction MUSD → BTC redemption helper for [Mezo](https://mezo.org) mainnet.

**Not affiliated with Mezo.** No official support. Use at your own risk. Prefer an official redeem UI if Mezo ships one.

- Repo: https://github.com/WilliamPyke/musd-fresh-redeem
- App: https://musd-fresh-redeem-williampykes-projects.vercel.app

If the Vercel URL asks you to log in, open the project in Vercel and turn **Deployment Protection** off so Discord users can load it without SSO.

## Why this exists

`TroveManager.redeemCollateral` rejects a partial redemption unless `_partialRedemptionHintNICR` matches the post-redeem NICR in a tiny band (~0.00002%). Off-chain hints from the explorer, mezotools, or a script are computed in block N and almost always mined in block N+1. One BTC oracle tick and the transaction reverts.

This app deploys a helper that computes those hints **inside the redeem transaction**: `fetchPrice` → `getRedemptionHints` → `findInsertPosition` → `redeemCollateral`. Wallet confirmation delay cannot stale the hints.

## What you do

1. Connect an injected wallet on Mezo (chain id `31612`).
2. Deploy `RedeemHelper` once from your wallet (bytecode is baked into the UI).
3. Approve MUSD for that helper.
4. Redeem. BTC and leftover MUSD come back to you in the same transaction.

The helper has **no owner and no sweep**. It only moves tokens you approve for that call.

Optional: set `NEXT_PUBLIC_HELPER_ADDRESS` if you already deployed a helper and want the UI to default to it.

## Addresses (Mezo mainnet)

| Contract | Address |
| --- | --- |
| TroveManager | `0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193` |
| HintHelpers | `0xD267b3bE2514375A075fd03C3D9CBa6b95317DC3` |
| SortedTroves | `0x8C5DB4C62BF29c1C4564390d10c20a47E0b2749f` |
| PriceFeed | `0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88` |
| MUSD | `0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186` |

## Develop

```bash
npm install
npm test
npm run dev
```

`RedeemHelper.sol` is compiled with `solc` 0.8.24 (`npm run compile`). Foundry tests live at `contracts/test/RedeemHelper.t.sol` if you have `forge` installed.

## Security notes

- This is a thin wrapper, not a protocol change.
- You still pay gas and accept TroveManager redemption rules (truncated amount, max iterations, collateral from the lowest-ICR troves).
- Do not approve MUSD to an address you did not deploy or verify.
- The quote in the UI is display-only and can still be stale. The transaction recomputes hints on-chain.
