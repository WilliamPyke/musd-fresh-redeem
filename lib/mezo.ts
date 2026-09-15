export const MEZO_CHAIN_ID = 31612;

export const mezo = {
  id: MEZO_CHAIN_ID,
  name: "Mezo",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        "https://rpc.mezo.org",
        "https://api.explorer.mezo.org/api/eth-rpc",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Mezo Explorer",
      url: "https://explorer.mezo.org",
    },
  },
} as const;

export const ADDRESSES = {
  troveManager: "0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193",
  hintHelpers: "0xD267b3bE2514375A075fd03C3D9CBa6b95317DC3",
  sortedTroves: "0x8C5DB4C62BF29c1C4564390d10c20a47E0b2749f",
  priceFeed: "0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88",
  musd: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
} as const;

export const STORAGE_KEY = `musd-fresh-redeem.helper.${MEZO_CHAIN_ID}`;

export const DEFAULT_MAX_ITERATIONS = 50n;

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export const priceFeedAbi = [
  {
    type: "function",
    name: "fetchPrice",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const hintHelpersAbi = [
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
] as const;

export const redeemHelperAbi = [
  {
    type: "constructor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_troveManager", type: "address" },
      { name: "_hintHelpers", type: "address" },
      { name: "_sortedTroves", type: "address" },
      { name: "_priceFeed", type: "address" },
      { name: "_musd", type: "address" },
    ],
  },
  {
    type: "function",
    name: "redeem",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "maxIterations", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const HELPER_ARTIFACT_URL =
  "https://raw.githubusercontent.com/WilliamPyke/musd-fresh-redeem/main/lib/generated/RedeemHelper.json";

