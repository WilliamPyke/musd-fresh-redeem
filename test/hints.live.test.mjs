import assert from "node:assert/strict";
import test from "node:test";
import { createPublicClient, fallback, http, parseEther } from "viem";

const MEZO_ID = 31612;
const PRICE_FEED = "0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88";
const HINT_HELPERS = "0xD267b3bE2514375A075fd03C3D9CBa6b95317DC3";
const SAFETY_BUFFER = "0xB0C9A818A4E5d9184E5C9108a144E607dEa90100";

const mezo = {
  id: MEZO_ID,
  name: "Mezo",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://api.explorer.mezo.org/api/eth-rpc"] },
  },
};

const priceFeedAbi = [
  {
    type: "function",
    name: "fetchPrice",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const hintHelpersAbi = [
  {
    type: "function",
    name: "getRedemptionHints",
    stateMutability: "view",
    inputs: [
      { name: "_amount", type: "uint256" },
      { name: "_price", type: "uint256" },
      { name: "_maxIterations", type: "uint256" },
    ],
    outputs: [
      { name: "firstRedemptionHint", type: "address" },
      { name: "partialRedemptionHintNICR", type: "uint256" },
      { name: "truncatedAmount", type: "uint256" },
    ],
  },
];

test("live Mezo hints: first redeemable trove is SafetyBuffer and truncated > 0", async (t) => {
  const client = createPublicClient({
    chain: mezo,
    transport: fallback([
      http("https://api.explorer.mezo.org/api/eth-rpc"),
      http("https://rpc.mezo.org"),
    ]),
  });

  let price;
  try {
    const sim = await client.simulateContract({
      address: PRICE_FEED,
      abi: priceFeedAbi,
      functionName: "fetchPrice",
    });
    price = sim.result;
  } catch (err) {
    t.skip(`RPC unavailable: ${err instanceof Error ? err.message : err}`);
    return;
  }

  assert.ok(price > 0n, "oracle price");

  const [firstHint, partialNicr, truncated] = await client.readContract({
    address: HINT_HELPERS,
    abi: hintHelpersAbi,
    functionName: "getRedemptionHints",
    args: [parseEther("100"), price, 50n],
  });

  assert.equal(firstHint.toLowerCase(), SAFETY_BUFFER.toLowerCase());
  assert.ok(truncated > 0n, "something is redeemable");
  assert.ok(partialNicr > 0n, "partial NICR is set for the leftover trove");
  assert.ok(
    truncated <= parseEther("100"),
    "HintHelpers never inflates the redeem size",
  );
});
