import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { LoginButton } from "@/components/login-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  UserPlus,
  Tv,
  Share2,
  Gift,
  Wallet,
  Rocket,
} from "lucide-react";

const STEPS = [
  {
    icon: UserPlus,
    step: "1",
    title: "Create your account",
    desc: "Sign in with Google. Your own donation page and widget are created automatically.",
  },
  {
    icon: Tv,
    step: "2",
    title: "Open the widget",
    desc: "Go to Dashboard → Media Share. Copy your Widget URL and open it in a browser, second monitor, TV, or browser source — no OBS needed.",
  },
  {
    icon: Share2,
    step: "3",
    title: "Customize & share",
    desc: "Set your minimum donation, display duration, and which media types are allowed. Share your /donate/username page with your audience.",
  },
  {
    icon: Gift,
    step: "4",
    title: "Receive support",
    desc: "Supporters fill the form, pick an amount and optional media (YouTube, GIF, or image), then pay through Midtrans (QRIS, bank transfer, e-wallet).",
  },
  {
    icon: Wallet,
    step: "5",
    title: "Get paid & watch media live",
    desc: "Once payment is confirmed by the webhook, your wallet is credited (net of the platform fee) and the media plays automatically on the widget in ~2 seconds.",
  },
  {
    icon: Rocket,
    step: "6",
    title: "Track everything",
    desc: "The dashboard shows your donations, wallet balance, and ledger history. Withdrawals will be available in a future phase.",
  },
];

export default async function GuidePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="container mx-auto max-w-5xl flex-1 px-4 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-extrabold sm:text-4xl">
            Get Started —{" "}
            <span className="text-primary">User Guide</span>
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Set up your own media-share page in a few minutes and start
            receiving support with media playing live on your widget.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <Card key={s.step} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                    {s.step}
                  </div>
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="mt-3">{s.title}</CardTitle>
                <CardDescription>{s.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Card className="mt-10 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <p className="text-lg font-semibold">
              Ready to receive your first donation?
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <LoginButton size="lg">Create your account</LoginButton>
            </div>
          </CardContent>
        </Card>
      </main>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} MediaShare
      </footer>
    </div>
  );
}
