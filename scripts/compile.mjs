import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function load(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const input = {
  language: "Solidity",
  sources: {
    "contracts/RedeemHelper.sol": { content: load("contracts/RedeemHelper.sol") },
    "contracts/test/Mocks.sol": { content: load("contracts/test/Mocks.sol") },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "shanghai",
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
if (output.errors?.some((e) => e.severity === "error")) {
  console.error(output.errors);
  process.exit(1);
}

const helper = output.contracts["contracts/RedeemHelper.sol"].RedeemHelper;
const mocks = output.contracts["contracts/test/Mocks.sol"];

const generatedDir = join(root, "lib", "generated");
mkdirSync(generatedDir, { recursive: true });

const artifact = {
  abi: helper.abi,
  bytecode: `0x${helper.evm.bytecode.object}`,
};

writeFileSync(
  join(generatedDir, "RedeemHelper.json"),
  `${JSON.stringify(artifact, null, 2)}\n`,
);

writeFileSync(
  join(generatedDir, "mocks.json"),
  `${JSON.stringify(
    Object.fromEntries(
      Object.entries(mocks).map(([name, art]) => [
        name,
        {
          abi: art.abi,
          bytecode: `0x${art.evm.bytecode.object}`,
        },
      ]),
    ),
    null,
    2,
  )}\n`,
);

writeFileSync(
  join(generatedDir, "RedeemHelper.ts"),
  `export const redeemHelperAbi = ${JSON.stringify(helper.abi, null, 2)} as const;\n\nexport const redeemHelperBytecode = "0x${helper.evm.bytecode.object}" as const;\n`,
);

console.log("compiled RedeemHelper", artifact.bytecode.length / 2 - 1, "bytes");
