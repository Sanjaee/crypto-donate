import { auth } from "@/lib/auth";
import { serverApi } from "@/lib/api";
import { formatIDR, formatDateTime } from "@/lib/format";
import type { WalletSummary, WalletTransaction } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  const [summary, transactions] = await Promise.all([
    serverApi<WalletSummary>("/wallet", userId).catch(() => null),
    serverApi<WalletTransaction[]>("/wallet/transactions", userId).catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Wallet</h1>
        <p className="text-muted-foreground">Your balance and ledger history.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Available Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extrabold">
              {summary ? formatIDR(summary.balance) : "-"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Received
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extrabold">
              {summary ? formatIDR(summary.totalReceived) : "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No transactions yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {t.description || t.referenceType}
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.type === "CREDIT" ? "success" : "destructive"}>
                        {t.type === "CREDIT" ? "+" : "-"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatIDR(t.amount)}</TableCell>
                    <TableCell>{formatDateTime(t.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
