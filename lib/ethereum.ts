import { type Hex, createPublicClient, createWalletClient, custom, fallback, http } from "viem";
import { mezo } from "./mezo";

export const publicClient = createPublicClient({
  chain: mezo,
  transport: fallback([
    http("https://api.explorer.mezo.org/api/eth-rpc"),
    http("https://rpc.mezo.org"),
  ]),
});

export function getInjectedProvider() {
  if (typeof window === "undefined") return undefined;
  return window.ethereum;
}

export function walletClientFrom(account: Hex) {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("No injected wallet");
  return createWalletClient({
    account,
    chain: mezo,
    transport: custom(provider),
  });
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: {
        method: string;
        params?: unknown[] | object;
      }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (
        event: string,
        handler: (...args: unknown[]) => void,
      ) => void;
    };
  }
}
