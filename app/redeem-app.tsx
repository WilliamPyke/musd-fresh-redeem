"use client";

import { type Hex, formatUnits, isAddress, parseUnits } from "viem";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  redeemHelperAbi,
  redeemHelperBytecode,
} from "@/lib/generated/RedeemHelper";
import {
  ADDRESSES,
  DEFAULT_MAX_ITERATIONS,
  MEZO_CHAIN_ID,
  STORAGE_KEY,
  erc20Abi,
  hintHelpersAbi,
  priceFeedAbi,
} from "@/lib/mezo";
import {
  getInjectedProvider,
  publicClient,
  walletClientFrom,
} from "@/lib/ethereum";

const OPTIONAL_SHARED =
  process.env.NEXT_PUBLIC_HELPER_ADDRESS?.toLowerCase() ?? "";

function short(addr?: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function explorer(path: string) {
  return `https://explorer.mezo.org${path}`;
}

const MEZO_HEX = `0x${MEZO_CHAIN_ID.toString(16)}`;

export function RedeemApp() {
  const [address, setAddress] = useState<Hex | "">("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [helper, setHelper] = useState<Hex | "">("");
  const [paste, setPaste] = useState("");
  const [amount, setAmount] = useState("100");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [musdBalance, setMusdBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [quote, setQuote] = useState<{
    first: Hex;
    nicr: bigint;
    truncated: bigint;
  } | null>(null);

  const onMezo = chainId === MEZO_CHAIN_ID;
  const parsedAmount = useMemo(() => {
    try {
      return parseUnits(amount || "0", 18);
    } catch {
      return 0n;
    }
  }, [amount]);
  const needsApprove =
    Boolean(helper) && parsedAmount > 0n && (allowance ?? 0n) < parsedAmount;

  const refreshWallet = useCallback(async () => {
    const eth = getInjectedProvider();
    if (!eth) return;
    const [accounts, cid] = (await Promise.all([
      eth.request({ method: "eth_accounts" }),
      eth.request({ method: "eth_chainId" }),
    ])) as [string[], string];
    setAddress((accounts[0] as Hex) ?? "");
    setChainId(Number.parseInt(cid, 16));
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isAddress(stored)) setHelper(stored as Hex);
    else if (OPTIONAL_SHARED && isAddress(OPTIONAL_SHARED)) {
      setHelper(OPTIONAL_SHARED as Hex);
    }
    void refreshWallet();
    const eth = getInjectedProvider();
    const onAccounts = () => void refreshWallet();
    const onChain = () => void refreshWallet();
    eth?.on?.("accountsChanged", onAccounts);
    eth?.on?.("chainChanged", onChain);
    return () => {
      eth?.removeListener?.("accountsChanged", onAccounts);
      eth?.removeListener?.("chainChanged", onChain);
    };
  }, [refreshWallet]);

  useEffect(() => {
    if (helper) window.localStorage.setItem(STORAGE_KEY, helper);
  }, [helper]);

  useEffect(() => {
    if (!address || !onMezo) {
      setMusdBalance(null);
      setAllowance(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const bal = await publicClient.readContract({
        address: ADDRESSES.musd,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      if (!cancelled) setMusdBalance(bal);
      if (helper) {
        const allow = await publicClient.readContract({
          address: ADDRESSES.musd,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, helper],
        });
        if (!cancelled) setAllowance(allow);
      }
    })().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      cancelled = true;
    };
  }, [address, onMezo, helper]);

  useEffect(() => {
    if (!onMezo || parsedAmount === 0n) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const sim = await publicClient.simulateContract({
        address: ADDRESSES.priceFeed,
        abi: priceFeedAbi,
        functionName: "fetchPrice",
      });
      const [first, nicr, truncated] = await publicClient.readContract({
        address: ADDRESSES.hintHelpers,
        abi: hintHelpersAbi,
        functionName: "getRedemptionHints",
        args: [parsedAmount, sim.result, DEFAULT_MAX_ITERATIONS],
      });
      if (!cancelled) setQuote({ first, nicr, truncated });
    })().catch(() => {
      if (!cancelled) setQuote(null);
    });
    return () => {
      cancelled = true;
    };
  }, [onMezo, parsedAmount]);

  async function run(label: string, fn: () => Promise<string>) {
    setError("");
    setStatus(label);
    setBusy(true);
    try {
      const hash = await fn();
      setStatus(`${label} ${short(hash)}`);
      await refreshWallet();
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="banner">
        Unofficial community tool. Not affiliated with Mezo. Do not send funds
        to this site. You deploy the helper from your own wallet; this UI never
        holds keys or MUSD. Hints are computed on-chain inside your redeem
        transaction so they cannot go stale the way explorer / mezotools calls
        do.
      </div>
      <h1>Fresh Redeem</h1>
      <p className="lede">
        Redeem MUSD for native BTC on Mezo without racing the next oracle
        update. One-time helper deploy, approve, then redeem.
      </p>

      <section className="card">
        <h2>1. Wallet</h2>
        {!address ? (
          <button
            disabled={busy}
            onClick={() =>
              run("Connecting", async () => {
                const eth = getInjectedProvider();
                if (!eth) throw new Error("No injected wallet found");
                await eth.request({ method: "eth_requestAccounts" });
                await refreshWallet();
                return "connected";
              })
            }
          >
            Connect injected wallet
          </button>
        ) : (
          <div className="row">
            <span className="mono">{address}</span>
            {!onMezo && (
              <button
                disabled={busy}
                onClick={() =>
                  run("Switching to Mezo", async () => {
                    const eth = getInjectedProvider();
                    if (!eth) throw new Error("No injected wallet");
                    try {
                      await eth.request({
                        method: "wallet_switchEthereumChain",
                        params: [{ chainId: MEZO_HEX }],
                      });
                    } catch {
                      await eth.request({
                        method: "wallet_addEthereumChain",
                        params: [
                          {
                            chainId: MEZO_HEX,
                            chainName: "Mezo",
                            nativeCurrency: {
                              name: "Bitcoin",
                              symbol: "BTC",
                              decimals: 18,
                            },
                            rpcUrls: ["https://rpc.mezo.org"],
                            blockExplorerUrls: ["https://explorer.mezo.org"],
                          },
                        ],
                      });
                    }
                    await refreshWallet();
                    return "mezo";
                  })
                }
              >
                Switch to Mezo
              </button>
            )}
          </div>
        )}
        {address && onMezo && (
          <p className="status ok">
            MUSD balance{" "}
            {musdBalance !== null ? formatUnits(musdBalance, 18) : "…"}
          </p>
        )}
      </section>

      <section className="card">
        <h2>2. Your helper contract</h2>
        <p className="status">
          Deploy once. The bytecode is fixed in this app. The helper has no
          owner and no sweep — it only pulls MUSD you approve, redeems, and
          sends BTC plus leftover MUSD back to you.
        </p>
        {helper ? (
          <p className="mono">
            Helper{" "}
            <a href={explorer(`/address/${helper}`)} target="_blank">
              {helper}
            </a>
          </p>
        ) : (
          <p className="status">No helper saved in this browser yet.</p>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button
            disabled={!address || !onMezo || busy}
            onClick={() =>
              run("Deploying helper", async () => {
                if (!address) throw new Error("Connect first");
                const wallet = walletClientFrom(address);
                const hash = await wallet.deployContract({
                  abi: redeemHelperAbi,
                  bytecode: redeemHelperBytecode,
                  args: [
                    ADDRESSES.troveManager,
                    ADDRESSES.hintHelpers,
                    ADDRESSES.sortedTroves,
                    ADDRESSES.priceFeed,
                    ADDRESSES.musd,
                  ],
                });
                const receipt = await publicClient.waitForTransactionReceipt({
                  hash,
                });
                if (!receipt.contractAddress) {
                  throw new Error("Deploy mined without an address");
                }
                setHelper(receipt.contractAddress);
                return hash;
              })
            }
          >
            Deploy helper
          </button>
        </div>
        <label style={{ marginTop: 14 }}>Or paste an existing helper</label>
        <div className="row">
          <input
            value={paste}
            placeholder="0x…"
            onChange={(e) => setPaste(e.target.value)}
          />
          <button
            className="secondary"
            onClick={() => {
              if (!isAddress(paste)) {
                setError("Not a valid address");
                return;
              }
              setHelper(paste as Hex);
              setError("");
            }}
          >
            Use
          </button>
        </div>
      </section>

      <section className="card">
        <h2>3. Redeem</h2>
        <label>MUSD amount</label>
        <input
          value={amount}
          inputMode="decimal"
          onChange={(e) => setAmount(e.target.value)}
        />
        {quote && (
          <div className="quote">
            <div>
              <span>Quote truncated (may change)</span>
              {formatUnits(quote.truncated, 18)} MUSD
            </div>
            <div>
              <span>First hint (display only)</span>
              <span className="mono">{quote.first}</span>
            </div>
          </div>
        )}
        <p className="status">
          The quote above is off-chain and can still go stale. The redeem
          transaction recomputes fetchPrice + hints on-chain.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <button
            disabled={!helper || !address || !onMezo || !needsApprove || busy}
            onClick={() =>
              run("Approving MUSD", async () => {
                if (!address || !helper) throw new Error("Missing helper");
                const hash = await walletClientFrom(address).writeContract({
                  address: ADDRESSES.musd,
                  abi: erc20Abi,
                  functionName: "approve",
                  args: [helper, parsedAmount],
                });
                await publicClient.waitForTransactionReceipt({ hash });
                const allow = await publicClient.readContract({
                  address: ADDRESSES.musd,
                  abi: erc20Abi,
                  functionName: "allowance",
                  args: [address, helper],
                });
                setAllowance(allow);
                return hash;
              })
            }
          >
            Approve MUSD
          </button>
          <button
            disabled={
              !helper ||
              !address ||
              !onMezo ||
              needsApprove ||
              parsedAmount === 0n ||
              busy
            }
            onClick={() =>
              run("Redeeming", async () => {
                if (!address || !helper) throw new Error("Missing helper");
                const hash = await walletClientFrom(address).writeContract({
                  address: helper,
                  abi: redeemHelperAbi,
                  functionName: "redeem",
                  args: [parsedAmount, DEFAULT_MAX_ITERATIONS],
                });
                await publicClient.waitForTransactionReceipt({ hash });
                return hash;
              })
            }
          >
            Redeem
          </button>
        </div>
      </section>

      {status && <p className="status ok">{status}</p>}
      {error && <p className="status err">{error}</p>}

      <footer>
        Mezo mainnet 31612. TroveManager{" "}
        <a href={explorer(`/address/${ADDRESSES.troveManager}`)}>
          {short(ADDRESSES.troveManager)}
        </a>
        . Source and contract are public. Prefer an official Mezo redeem UI if
        one ships.
      </footer>
    </main>
  );
}
