"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { publicApi } from "@/lib/api";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Check,
  Loader2,
  QrCode,
  CheckCircle2,
  Clock,
  Wallet,
  XCircle,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

const POLL_MS = 3000;

type PaymentStatus = {
  orderId: string;
  status: string;
  gatewayStatus?: string;
  currency?: string;
  cryptoAmount?: string;
  pendingAmount?: string;
  receivedAmount?: string;
  walletHash?: string;
  qrCode?: string;
  grossAmount: number;
};

const num = (s?: string) => parseFloat(s ?? "") || 0;

export default function PaymentPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const orderId = params.orderId;

  const [data, setData] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedRemaining, setCopiedRemaining] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function poll() {
      try {
        const res = await publicApi<PaymentStatus>(
          `/payments/${orderId}/status`,
        );
        if (stopped) return;
        setData(res);
        setLoading(false);
      } catch (err) {
        if (stopped) return;
        setError(err instanceof Error ? err.message : "Transaction not found");
        setLoading(false);
      }
    }

    poll();
    timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [orderId]);

  const required = num(data?.cryptoAmount);
  const received = num(data?.receivedAmount);
  const pendingRemaining = num(data?.pendingAmount);
  const ps = data?.gatewayStatus;

  const isPaid = data?.status === "PAID";
  const isExpired = data?.status === "EXPIRED";
  const isCancelled = data?.status === "CANCELLED";

  // Tentukan layar.
  let screen: "loading" | "error" | "success" | "expired" | "qr" | "processing" | "partial";
  if (error) screen = "error";
  else if (loading && !data) screen = "loading";
  else if (isPaid) screen = "success";
  else if (isExpired || isCancelled) screen = "expired";
  else if (received > 0 && pendingRemaining > 0 && pendingRemaining < required) screen = "partial";
  else if (received > 0 || ps === "pending" || ps === "pending internal") screen = "processing";
  else screen = "qr";

  async function copyAddress() {
    if (!data?.walletHash) return;
    try {
      await navigator.clipboard.writeText(data.walletHash);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
      toast.success("Address copied");
    } catch {
      toast.error("Failed to copy address");
    }
  }

  async function copyRemaining() {
    if (!data) return;
    const remaining = (pendingRemaining || required - received).toFixed(8);
    try {
      await navigator.clipboard.writeText(`${remaining} ${data.currency || ""}`.trim());
      setCopiedRemaining(true);
      setTimeout(() => setCopiedRemaining(false), 2000);
      toast.success("Amount copied");
    } catch {
      toast.error("Failed to copy amount");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-muted/40">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-bold">
            Tip<span className="text-primary">Chain</span>
          </Link>
          <span className="font-mono text-xs text-muted-foreground">
            {orderId}
          </span>
        </div>
      </header>

      <main className="container mx-auto flex w-full max-w-2xl flex-1 items-center justify-center px-4 py-10">
        {/* Transisi halus antar layar */}
        <div key={screen} className="w-full animate-fade-in-up">
          {screen === "loading" && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading payment...</p>
            </div>
          )}

          {screen === "error" && (
            <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-8 text-center shadow">
              <XCircle className="mx-auto h-12 w-12 text-destructive" />
              <p className="mt-3 font-semibold">Transaction not found</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/">Go back</Link>
              </Button>
            </div>
          )}

          {screen === "success" && (
            <div className="mx-auto w-full max-w-md rounded-xl border border-emerald-500/40 bg-emerald-50 p-10 text-center shadow-2xl dark:bg-emerald-950/30">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-background shadow-xl">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              </div>
              <h2 className="mt-5 text-2xl font-extrabold uppercase tracking-wide">
                Payment Successful!
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your support is live. The media will play on the widget
                automatically.
              </p>
              <div className="mt-4 rounded-lg bg-background px-4 py-2 text-sm font-semibold">
                {data?.cryptoAmount || "—"} {data?.currency || "BTC"}
              </div>
              <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecting to home in a moment...
              </div>
              <Button asChild className="mt-4 w-full">
                <Link href="/">Continue</Link>
              </Button>
            </div>
          )}

          {screen === "expired" && (
            <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-8 text-center shadow">
              <XCircle className="mx-auto h-14 w-14 text-muted-foreground" />
              <h2 className="mt-3 text-xl font-bold">
                {isExpired ? "Payment expired" : "Payment cancelled"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                No payment was received. You can try again.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/">Go back</Link>
              </Button>
            </div>
          )}

          {screen === "qr" && data && (
            <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-8 text-center shadow">
              <h2 className="flex items-center justify-center gap-2 text-lg font-bold">
                <QrCode className="h-5 w-5 text-primary" /> Scan to pay with{" "}
                {data.currency || "BTC"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Send the amount below to the address (or scan the QR).
              </p>

              <div className="mt-4 flex items-center justify-center gap-2">
                <p className="text-3xl font-extrabold">
                  {(pendingRemaining || required || num(data.cryptoAmount)).toFixed(8)}{" "}
                  <span className="text-primary">{data.currency || "BTC"}</span>
                </p>
              </div>

              {data.qrCode ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.qrCode}
                  alt={`${data.currency} payment QR code`}
                  className="mx-auto mt-4 h-64 w-64 rounded-xl border bg-white p-2"
                />
              ) : (
                <div className="mx-auto mt-4 flex h-64 w-64 items-center justify-center rounded-xl border bg-muted">
                  <QrCode className="h-12 w-12 text-muted-foreground" />
                </div>
              )}

              {data.walletHash && (
                <div className="mt-4 w-full rounded-xl border bg-muted p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Wallet className="h-4 w-4" /> Send to this address
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={copyAddress}
                    >
                      {copiedAddress ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <code className="block break-all text-sm font-semibold">
                    {data.walletHash}
                  </code>
                </div>
              )}

              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-4 w-4" /> Invoice expires in 60 minutes.
              </div>
              <div className="mt-4">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" /> Cancel Payment
                </Link>
              </div>
            </div>
          )}

          {screen === "processing" && data && (
            <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-xl border bg-card p-10 text-center shadow">
              {/* Progress bar animasi */}
              <div className="absolute left-0 top-0 h-1.5 w-full overflow-hidden bg-black/10">
                <div className="h-full w-1/2 animate-[slide_1.5s_ease-in-out_infinite] bg-primary" />
              </div>
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-background shadow-xl">
                <Clock className="h-12 w-12 animate-pulse text-primary" />
              </div>
              <h2 className="mt-5 text-2xl font-extrabold uppercase tracking-wide">
                Awaiting Confirmation
              </h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Payment detected. Please wait for blockchain confirmation. You
                can close this page — we will process it automatically.
              </p>
              <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking payment status...
              </div>
            </div>
          )}

          {screen === "partial" && data && (
            <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-8 text-center shadow">
              <h2 className="text-lg font-bold">Partial payment received</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                We received {received.toFixed(8)} {data.currency}. To complete
                your payment, please send the remaining amount:
              </p>

              <button
                type="button"
                onClick={copyRemaining}
                className="mx-auto mt-4 flex items-center justify-center gap-2 text-3xl font-extrabold text-red-500 transition-colors hover:text-red-400"
                title="Click to copy"
              >
                {(pendingRemaining || required - received).toFixed(8)}{" "}
                {data.currency}
                {copiedRemaining ? (
                  <Check className="h-5 w-5 text-emerald-500" />
                ) : (
                  <Copy className="h-5 w-5 opacity-50 hover:opacity-100" />
                )}
              </button>

              <p className="mt-3 text-sm text-muted-foreground">to the address below:</p>

              {data.walletHash && (
                <div className="mt-3 w-full rounded-xl border bg-muted p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Wallet className="h-4 w-4" /> Send to this address
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={copyAddress}
                    >
                      {copiedAddress ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <code className="block break-all text-sm font-semibold">
                    {data.walletHash}
                  </code>
                </div>
              )}

              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="animate-pulse">Waiting for remaining payment...</span>
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />

      <style jsx global>{`
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}
