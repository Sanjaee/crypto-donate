"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { clientApi, publicApi } from "@/lib/api";
import { formatUSD } from "@/lib/format";
import type { Withdrawal } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Send, ChevronDown, Copy } from "lucide-react";

type CryptoMethod = {
  cid: string;
  currency: string;
  name: string;
  icon?: string;
  priceUsd?: string;
};

const DEFAULT_COINS: CryptoMethod[] = [
  { cid: "BTC", currency: "BTC", name: "Bitcoin", icon: "/crypto-icons/BTC.svg" },
  { cid: "SOL", currency: "SOL", name: "Solana", icon: "/crypto-icons/SOL.svg" },
  { cid: "ETH", currency: "ETH", name: "Ethereum", icon: "/crypto-icons/ETH.svg" },
  { cid: "USDT", currency: "USDT", name: "Tether USD", icon: "/crypto-icons/USDT.svg" },
  { cid: "LTC", currency: "LTC", name: "Litecoin", icon: "/crypto-icons/LTC.svg" },
  { cid: "BCH", currency: "BCH", name: "Bitcoin Cash", icon: "/crypto-icons/BCH.svg" },
  { cid: "DOGE", currency: "DOGE", name: "Dogecoin", icon: "/crypto-icons/DOGE.svg" },
  { cid: "XRP", currency: "XRP", name: "XRP", icon: "/crypto-icons/XRP.svg" },
];

const MAIN_COINS = ["BTC", "SOL", "ETH"];

const statusVariant: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  COMPLETED: "success",
  PROCESSING: "warning",
  PENDING: "warning",
  FAILED: "destructive",
  REJECTED: "secondary",
};

export default function WithdrawForm() {
  const [balance, setBalance] = useState(0);
  const [feePct, setFeePct] = useState(0);
  const [coins, setCoins] = useState<CryptoMethod[]>(DEFAULT_COINS);
  const [currency, setCurrency] = useState("SOL");
  const [amount, setAmount] = useState(500);
  const [address, setAddress] = useState("");
  const [history, setHistory] = useState<Withdrawal[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    clientApi<{
      balance: number;
      platformFeePct?: number;
    }>("/wallet")
      .then((w) => {
        setBalance(w.balance);
        setFeePct(w.platformFeePct ?? 0);
      })
      .catch(() => {});
    publicApi<CryptoMethod[]>("/payments/currencies")
      .then((res) => {
        if (res && res.length > 0) {
          setCoins(res);
          const first = res[0];
          if (first?.currency) setCurrency(first.currency);
        }
      })
      .catch(() => {});
    clientApi<Withdrawal[]>("/withdrawals")
      .then((list) => setHistory(list))
      .catch(() => {});
  }, []);

  const selected = useMemo(
    () => coins.find((c) => c.currency === currency),
    [coins, currency],
  );
  const priceUsd = Number(selected?.priceUsd) || 0;
  const platformFee = Math.round((amount * feePct) / 100);
  const netAmount = amount - platformFee;
  const cryptoEstimate =
    priceUsd > 0 ? (netAmount / 100 / priceUsd).toFixed(8) : "";

  function openConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!currency || !address.trim()) {
      toast.error("Please fill in the destination address");
      return;
    }
    if (amount < 500) {
      toast.error("Minimum withdrawal is $5.00");
      return;
    }
    if (amount > balance) {
      toast.error("Insufficient balance");
      return;
    }
    setConfirmOpen(true);
  }

  async function doWithdraw() {
    setSubmitting(true);
    try {
      const res = await clientApi<Withdrawal>("/withdrawals", {
        method: "POST",
        body: JSON.stringify({
          amount,
          currency,
          toAddress: address.trim(),
        }),
      });
      toast.success("Withdrawal processed");
      const updated = await clientApi<{ balance: number }>("/wallet");
      setBalance(updated.balance);
      setHistory((prev) => [res, ...prev].slice(0, 50));
      setAddress("");
      setConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Withdraw</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={openConfirm} className="space-y-4">
            <div className="rounded-lg bg-muted p-3 text-sm">
              Available balance:{" "}
              <span className="font-bold">{formatUSD(balance)}</span>
            </div>

            <div>
              <Label>Coin</Label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {MAIN_COINS.map((c) => {
                  const coin = coins.find((m) => m.currency === c);
                  return (
                    <Button
                      key={c}
                      type="button"
                      variant={currency === c ? "default" : "outline"}
                      className="h-auto flex-col gap-1 py-2"
                      onClick={() => {
                        setCurrency(c);
                        setShowMore(false);
                      }}
                    >
                      {coin?.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={coin.icon}
                          alt={c}
                          className="h-6 w-6 rounded-full" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                        />
                      ) : (
                        <span className="text-lg font-bold">{c[0]}</span>
                      )}
                      <span className="text-xs">{c}</span>
                    </Button>
                  );
                })}
                <Button
                  type="button"
                  variant={
                    currency && !MAIN_COINS.includes(currency)
                      ? "default"
                      : showMore
                        ? "default"
                        : "outline"
                  }
                  className="h-auto flex-col gap-1 py-2"
                  onClick={() => setShowMore((v) => !v)}
                >
                  <ChevronDown className="h-6 w-6" />
                  <span className="text-xs">
                    {currency && !MAIN_COINS.includes(currency)
                      ? currency
                      : "Other"}
                  </span>
                </Button>
              </div>

              {showMore && (
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-2">
                  {coins
                    .filter((c) => !MAIN_COINS.includes(c.currency))
                    .map((c) => (
                      <Button
                        key={c.cid}
                        type="button"
                        size="sm"
                        variant={
                          currency === c.currency ? "default" : "ghost"
                        }
                        onClick={() => {
                          setCurrency(c.currency);
                          setShowMore(false);
                        }}
                      >
                        {c.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.icon}
                            alt={c.name}
                            className="h-4 w-4 rounded-full" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                          />
                        ) : null}
                        {c.currency}
                      </Button>
                    ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Amount (USD)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  min={500}
                  step={100}
                  value={amount / 100}
                  onChange={(e) =>
                    setAmount(Math.round(Number(e.target.value) * 100))
                  }
                  className="pl-6"
                />
              </div>
              {cryptoEstimate && (
                <p className="text-xs text-muted-foreground">
                  ~ {cryptoEstimate} {currency}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address">{currency} address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={`Your ${currency} wallet address`}
                maxLength={200}
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Withdraw
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Platform fee ({feePct}%) is deducted from the amount. Balance is
              only deducted after the gateway approves the withdrawal.
            </p>
          </form>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm withdrawal</DialogTitle>
            <DialogDescription>
              Review the amounts before sending.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Withdraw</span>
              <span className="font-semibold">{formatUSD(amount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Platform fee ({feePct}%)
              </span>
              <span className="font-semibold text-destructive">
                -{formatUSD(platformFee)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <span className="font-medium">You receive</span>
              <span className="font-bold text-primary">
                {formatUSD(netAmount)}
              </span>
            </div>
            {cryptoEstimate && (
              <p className="text-xs text-muted-foreground">
                ~ {cryptoEstimate} {currency} sent to your address
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={doWithdraw}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Confirm
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Withdrawal History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No withdrawals yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {history.map((w) => (
                <li
                  key={w.id}
                  className="rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {formatUSD(w.amount)}
                    </span>
                    <Badge variant={statusVariant[w.status] ?? "secondary"}>
                      {w.status}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <code className="break-all">{w.toAddress}</code>
                    {w.cryptoAmount && (
                      <span className="shrink-0">
                        ~ {w.cryptoAmount} {w.currency}
                      </span>
                    )}
                  </div>
                  {w.txUrl && (
                    <a
                      href={w.txUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Copy className="h-3 w-3" /> View transaction
                    </a>
                  )}
                  {w.errorMessage && (
                    <p className="mt-1 text-xs text-destructive">
                      {w.errorMessage}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {w.createdAt}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}