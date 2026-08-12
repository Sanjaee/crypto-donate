"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { clientApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";

type ConfigResponse = {
  platformFeePct: number;
};

export default function PlatformFeeCard() {
  const [fee, setFee] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    clientApi<ConfigResponse>("/admin/config")
      .then((cfg) => setFee(cfg.platformFeePct))
      .catch(() => toast.error("Failed to load platform settings"))
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (fee === null || fee < 0 || fee > 50) {
      toast.error("Fee must be between 0% and 50%");
      return;
    }
    setSaving(true);
    try {
      const cfg = await clientApi<ConfigResponse>("/admin/config", {
        method: "PATCH",
        body: JSON.stringify({ platformFeePct: fee }),
      });
      setFee(cfg.platformFeePct);
      toast.success("Platform fee updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Platform Fee</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="platform-fee">
              Fee per donation (%)
            </Label>
            <div className="relative max-w-[160px]">
              <Input
                id="platform-fee"
                type="number"
                min={0}
                max={50}
                step={0.5}
                disabled={loading}
                value={fee ?? ""}
                onChange={(e) =>
                  setFee(
                    e.target.value === ""
                      ? null
                      : Math.round(Number(e.target.value) * 10) / 10,
                  )
                }
                placeholder="5"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                %
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Deducted from each donation; the creator receives the remainder.
            Applies to new donations.
          </p>
          <Button
            type="submit"
            disabled={saving || loading || fee === null}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Save
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
