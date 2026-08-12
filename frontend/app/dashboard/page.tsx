import { auth } from "@/lib/auth";
import { serverApi } from "@/lib/api";
import { formatUSD } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift, HandCoins, Tv, PiggyBank } from "lucide-react";
import WithdrawForm from "@/components/withdraw-form";
import ProfileCard from "@/components/profile-card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  const stats = await serverApi<{
    totalDonations: number;
    paidDonations: number;
    queuedMedia: number;
    totalReceived: number;
  }>("/dashboard/stats", userId).catch(() => null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Hello, {session?.user?.name ?? "Creator"} 👋
        </h1>
        <p className="text-muted-foreground">
          Overview of your account &amp; support.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Donations", value: stats?.totalDonations, icon: Gift },
          { label: "Paid Donations", value: stats?.paidDonations, icon: HandCoins },
          { label: "Queued Media", value: stats?.queuedMedia, icon: Tv },
          {
            label: "Total Received",
            value: stats ? formatUSD(stats.totalReceived) : null,
            icon: PiggyBank,
          },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <s.icon className="h-4 w-4" /> {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {s.value === null || s.value === undefined ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <p className="text-2xl font-bold">{s.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <ProfileCard />

      <WithdrawForm />
    </div>
  );
}
