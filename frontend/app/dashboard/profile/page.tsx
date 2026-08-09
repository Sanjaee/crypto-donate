import Link from "next/link";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export default async function ProfilePage() {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-muted-foreground">Your account information.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            {user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt={user.name ?? ""}
                className="h-12 w-12 rounded-full"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                {(user?.name ?? "?")[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-semibold">{user?.name}</p>
              <p className="text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">Donation page</p>
            <p className="font-mono text-sm">/donate/{user?.username}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/donate/${user?.username}`}>
              <ExternalLink className="h-4 w-4" /> View donation page
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
