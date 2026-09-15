import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ganache from "ganache";
import {
  decodeEventLog,
  encodeDeployData,
  encodeFunctionData,
  getAddress,
  hexToBigInt,
  parseEther,
} from "viem";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const helperArt = JSON.parse(
  readFileSync(join(root, "lib/generated/RedeemHelper.json"), "utf8"),
);
const mocks = JSON.parse(
  readFileSync(join(root, "lib/generated/mocks.json"), "utf8"),
);

const MNEMONIC =
  "test test test test test test test test test test test junk";

function art(name) {
  return name === "RedeemHelper" ? helperArt : mocks[name];
}

async function send(provider, from, tx) {
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from,
        gas: "0x7a1200",
        ...tx,
      },
    ],
  });
  const receipt = await provider.request({
    method: "eth_getTransactionReceipt",
    params: [hash],
  });
  if (!receipt) throw new Error(`no receipt for ${hash}`);
  if (receipt.status !== "0x1") {
    const err = new Error(`tx reverted: ${hash}`);
    err.receipt = receipt;
    throw err;
  }
  return receipt;
}

async function call(provider, to, data) {
  return provider.request({
    method: "eth_call",
    params: [{ to, data }, "latest"],
  });
}

async function deploy(provider, from, name, args = []) {
  const { abi, bytecode } = art(name);
  const data = encodeDeployData({ abi, bytecode, args });
  const receipt = await send(provider, from, { data });
  if (!receipt.contractAddress) throw new Error(`${name} missing address`);
  return {
    address: getAddress(receipt.contractAddress),
    abi,
  };
}

async function write(provider, from, contract, functionName, args = [], value) {
  const data = encodeFunctionData({
    abi: contract.abi,
    functionName,
    args,
  });
  return send(provider, from, {
    to: contract.address,
    data,
    ...(value ? { value } : {}),
  });
}

async function read(provider, contract, functionName, args = []) {
  const data = encodeFunctionData({
    abi: contract.abi,
    functionName,
    args,
  });
  return provider.request({
    method: "eth_call",
    params: [{ to: contract.address, data }, "latest"],
  });
}

async function setup() {
  const provider = Ganache.provider({
    wallet: { mnemonic: MNEMONIC, totalAccounts: 4, defaultBalance: 1000 },
    chain: { chainId: 31612, hardfork: "shanghai" },
    miner: { blockGasLimit: 30_000_000 },
    logging: { quiet: true },
  });
  const accounts = await provider.request({
    method: "eth_accounts",
    params: [],
  });
  const [deployer, user] = accounts;

  const musd = await deploy(provider, deployer, "MockERC20");
  const priceFeed = await deploy(provider, deployer, "MockPriceFeed");
  const hints = await deploy(provider, deployer, "RecordingHintHelpers");
  const sorted = await deploy(provider, deployer, "MockSortedTroves");
  const tm = await deploy(provider, deployer, "MockTroveManager");
  const helper = await deploy(provider, deployer, "RedeemHelper", [
    tm.address,
    hints.address,
    sorted.address,
    priceFeed.address,
    musd.address,
  ]);

  await write(provider, deployer, tm, "configure", [
    musd.address,
    parseEther("1"),
  ]);
  await send(provider, deployer, {
    to: tm.address,
    value: `0x${parseEther("10").toString(16)}`,
  });
  await write(provider, deployer, hints, "setHints", [
    "0xB0C9A818A4E5d9184E5C9108a144E607dEa90100",
    1_500_000_000_000_000_000_000n,
    parseEther("100"),
  ]);
  await write(provider, deployer, sorted, "setInsert", [
    "0x0000000000000000000000000000000000001111",
    "0x0000000000000000000000000000000000002222",
  ]);
  await write(provider, deployer, musd, "mint", [user, parseEther("1000")]);
  await write(provider, user, musd, "approve", [
    helper.address,
    2n ** 256n - 1n,
  ]);

  return {
    provider,
    deployer,
    user,
    musd,
    priceFeed,
    hints,
    sorted,
    tm,
    helper,
  };
}

function padWord(hex) {
  return `0x${hex.slice(2).padStart(64, "0")}`;
}

test("constructor rejects zero address", async () => {
  const ctx = await setup();
  await assert.rejects(() =>
    deploy(ctx.provider, ctx.deployer, "RedeemHelper", [
      "0x0000000000000000000000000000000000000000",
      ctx.hints.address,
      ctx.sorted.address,
      ctx.priceFeed.address,
      ctx.musd.address,
    ]),
  );
});

test("zero amount reverts", async () => {
  const ctx = await setup();
  await assert.rejects(() =>
    write(ctx.provider, ctx.user, ctx.helper, "redeem", [0n, 50n]),
  );
});

test("nothing redeemable reverts", async () => {
  const ctx = await setup();
  await write(ctx.provider, ctx.deployer, ctx.hints, "setHints", [
    "0xB0C9A818A4E5d9184E5C9108a144E607dEa90100",
    1n,
    0n,
  ]);
  await assert.rejects(() =>
    write(ctx.provider, ctx.user, ctx.helper, "redeem", [
      parseEther("100"),
      50n,
    ]),
  );
});

test("redeem uses in-tx hints, forwards BTC, refunds leftover MUSD", async () => {
  const ctx = await setup();
  const userBalBefore = hexToBigInt(
    await ctx.provider.request({
      method: "eth_getBalance",
      params: [ctx.user, "latest"],
    }),
  );

  const receipt = await write(ctx.provider, ctx.user, ctx.helper, "redeem", [
    parseEther("250"),
    0n,
  ]);

  const lastAmountRaw = await read(ctx.provider, ctx.tm, "lastAmount");
  const lastFirstRaw = await read(ctx.provider, ctx.tm, "lastFirst");
  const lastUpperRaw = await read(ctx.provider, ctx.tm, "lastUpper");
  const lastItersRaw = await read(ctx.provider, ctx.tm, "lastIters");
  const fetchCountRaw = await read(ctx.provider, ctx.priceFeed, "fetchCount");
  const userMusdRaw = await read(ctx.provider, ctx.musd, "balanceOf", [
    ctx.user,
  ]);
  const helperMusdRaw = await read(ctx.provider, ctx.musd, "balanceOf", [
    ctx.helper.address,
  ]);
  const helperNative = hexToBigInt(
    await ctx.provider.request({
      method: "eth_getBalance",
      params: [ctx.helper.address, "latest"],
    }),
  );
  const userBalAfter = hexToBigInt(
    await ctx.provider.request({
      method: "eth_getBalance",
      params: [ctx.user, "latest"],
    }),
  );

  assert.equal(hexToBigInt(lastAmountRaw), parseEther("100"));
  assert.equal(
    getAddress(`0x${lastFirstRaw.slice(-40)}`),
    getAddress("0xB0C9A818A4E5d9184E5C9108a144E607dEa90100"),
  );
  assert.equal(
    getAddress(`0x${lastUpperRaw.slice(-40)}`),
    getAddress("0x0000000000000000000000000000000000001111"),
  );
  assert.equal(hexToBigInt(lastItersRaw), 50n);
  assert.equal(hexToBigInt(fetchCountRaw), 1n);
  assert.equal(hexToBigInt(userMusdRaw), parseEther("900"));
  assert.equal(hexToBigInt(helperMusdRaw), 0n);
  assert.equal(helperNative, 0n);
  assert.ok(userBalAfter > userBalBefore - 10n ** 16n);

  const redeemed = receipt.logs
    .map((log) => {
      try {
        return decodeEventLog({
          abi: helperArt.abi,
          data: log.data,
          topics: log.topics,
        });
      } catch {
        return null;
      }
    })
    .find((e) => e?.eventName === "Redeemed");
  assert.equal(redeemed?.args.musdRequested, parseEther("250"));
  assert.equal(redeemed?.args.musdRedeemed, parseEther("100"));
  assert.equal(redeemed?.args.musdRefunded, parseEther("150"));
  assert.equal(redeemed?.args.btcOut, parseEther("1"));
  assert.equal(redeemed?.args.maxIterations, 50n);
});

test("helper has no owner or sweep", async () => {
  const ctx = await setup();
  await assert.rejects(() =>
    call(ctx.provider, ctx.helper.address, "0x8da5cb5b"),
  );
  const code = await ctx.provider.request({
    method: "eth_getCode",
    params: [ctx.helper.address, "latest"],
  });
  assert.ok(code && code.length > 4);
});
