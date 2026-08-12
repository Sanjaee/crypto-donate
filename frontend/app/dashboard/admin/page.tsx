import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { serverApi } from "@/lib/api";
import { formatUSD } from "@/lib/format";
import PlatformFeeCard from "@/components/platform-fee-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  email: string;
  username: string;
  name: string;
  role: string;
  provider: string;
  totalDonations: number;
  totalReceived: number;
  createdAt: string;
};

type AdminStats = {
  totalUsers: number;
  adminUsers: number;
  totalDonations: number;
  paidDonations: number;
  grossVolume: number;
  platformRevenue: number;
  netVolume: number;
  pendingPayments: number;
  queuedMedia: number;
};

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const userId = session.user.id;
  const [users, stats] = await Promise.all([
    serverApi<UserRow[]>("/admin/users", userId).catch(() => []),
    serverApi<AdminStats>("/admin/stats", userId).catch(() => null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          All users, income, and platform statistics.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Users", value: stats?.totalUsers, admin: false },
          { label: "Paid Donations", value: stats?.paidDonations, admin: false },
          {
            label: "Gross Volume",
            value: stats ? formatUSD(stats.grossVolume) : null,
            admin: false,
          },
          {
            label: "Platform Revenue",
            value: stats ? formatUSD(stats.platformRevenue) : null,
            admin: false,
          },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{s.value ?? "-"}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PlatformFeeCard />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            All Users{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({users.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No users yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Donations</TableHead>
                  <TableHead>Income (Net)</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.name}
                      <span className="block text-xs text-muted-foreground">
                        @{u.username}
                      </span>
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>
                        {u.role === "ADMIN" ? "Admin" : "Member"}
                      </Badge>
                    </TableCell>
                    <TableCell>{u.totalDonations}</TableCell>
                    <TableCell>{formatUSD(u.totalReceived)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.createdAt}
                    </TableCell>
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
