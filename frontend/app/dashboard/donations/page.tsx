import { auth } from "@/lib/auth";
import { serverApi } from "@/lib/api";
import { formatUSD, formatDateTime } from "@/lib/format";
import type { Donation } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

const statusVariant: Record<string, "success" | "warning" | "secondary" | "destructive"> = {
  PAID: "success",
  PENDING: "warning",
  EXPIRED: "secondary",
  CANCELLED: "destructive",
};

export default async function DonationsPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const donations = await serverApi<Donation[]>("/donations", userId).catch(
    () => null,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Donations</h1>
        <p className="text-muted-foreground">History of incoming support.</p>
      </div>

      {donations === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : donations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No donations yet. Share your{" "}
            <span className="font-mono">/donate/username</span> page!
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {donations.map((d) => (
            <Card key={d.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{d.donorName}</CardTitle>
                  <Badge
                    variant={statusVariant[d.paymentStatus] ?? "secondary"}
                  >
                    {d.paymentStatus}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-2 text-sm">
                <p className="text-2xl font-extrabold">
                  {formatUSD(d.amount)}
                </p>
                {d.message && (
                  <p className="text-muted-foreground">&ldquo;{d.message}&rdquo;</p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  {d.mediaType && <Badge variant="outline">{d.mediaType}</Badge>}
                  <span className="text-xs text-muted-foreground">
                    Net {formatUSD(d.netAmount)}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDateTime(d.createdAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
