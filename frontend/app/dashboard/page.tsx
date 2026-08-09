import { auth } from "@/lib/auth";
import { serverApi } from "@/lib/api";
import { formatUSD } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift, HandCoins, Tv, PiggyBank } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  const [stats, stream] = await Promise.all([
    serverApi<{
      totalDonations: number;
      paidDonations: number;
      queuedMedia: number;
      totalReceived: number;
    }>("/dashboard/stats", userId).catch(() => null),
    serverApi<{ streamKey: string }>("/stream-settings", userId).catch(() => null),
  ]);

  const widgetUrl = stream?.streamKey
    ? `${process.env.NEXT_PUBLIC_APP_URL}/widgets/mediashare?streamKey=${stream.streamKey}`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hello, {session?.user?.name ?? "Creator"} 👋</h1>
        <p className="text-muted-foreground">
          A summary of your support &amp; media share.
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

      {widgetUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Widget URL
              <Badge variant="success">Active</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <code className="block break-all rounded-lg bg-muted p-3 text-sm">
              {widgetUrl}
            </code>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
