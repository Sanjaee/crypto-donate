"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { clientApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Save } from "lucide-react";

type Me = {
  id: string;
  email: string;
  username: string;
  name: string;
  avatarUrl?: string;
};

export default function ProfileCard() {
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    clientApi<Me>("/users/me")
      .then((u) => {
        setMe(u);
        setName(u.name);
      })
      .catch(() => toast.error("Failed to load profile"));
  }, []);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const updated = await clientApi<Me>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      });
      setMe(updated);
      setName(updated.name);
      toast.success("Name updated");
    } catch {
      toast.error("Failed to update name");
    } finally {
      setSaving(false);
    }
  }

  if (!me) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-3">
          {me.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={me.avatarUrl}
              alt={me.name}
              className="h-12 w-12 rounded-full"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
              {(me.name ?? "?")[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold">{me.name}</p>
            <p className="text-muted-foreground">{me.email}</p>
          </div>
        </div>

        <div className="space-y-1.5 rounded-lg border bg-muted/40 p-4">
          <Label htmlFor="name">Change name</Label>
          <div className="flex gap-2">
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
            <Button onClick={saveName} disabled={saving} type="button">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground">Donation page</p>
          <p className="font-mono text-sm">/donate/{me.username}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/donate/${me.username}`}>
            <ExternalLink className="h-4 w-4" /> View donation page
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}