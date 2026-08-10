"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { clientApi } from "@/lib/api";
import { formatUSD } from "@/lib/format";
import type { StreamSetting } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, RefreshCw, MonitorPlay, ClipboardCheck, Send } from "lucide-react";

export default function TipChainPage() {
  const [setting, setSetting] = useState<StreamSetting | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  const widgetUrl = setting?.streamKey
    ? `${window.location.origin}/widgets/mediashare?streamKey=${setting.streamKey}`
    : "";

  const demoUrl = setting?.streamKey
    ? `${window.location.origin}/widgets/mediashare?streamKey=${setting.streamKey}&demo=1`
    : "";

  const load = useCallback(async () => {
    try {
      const s = await clientApi<StreamSetting>("/stream-settings");
      setSetting(s);
    } catch {
      toast.error("Failed to load data");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(widgetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy URL");
    }
  }

  async function regenerateKey() {
    if (!confirm("A new stream key will invalidate the old widget URL. Continue?")) return;
    try {
      const res = await clientApi<{ streamKey: string }>("/stream-settings/regenerate-key", {
        method: "POST",
      });
      setSetting((s) => (s ? { ...s, streamKey: res.streamKey } : s));
      toast.success("Stream key regenerated");
    } catch {
      toast.error("Failed to regenerate stream key");
    }
  }

  async function sendTest() {
    try {
      await clientApi("/media/test", { method: "POST" });
      toast.success("Demo media sent! Check the widget in ~2 seconds.");
    } catch {
      toast.error("Failed to send demo media");
    }
  }

  async function saveSettings() {
    if (!setting) return;
    setSaving(true);
    try {
      const updated = await clientApi<StreamSetting>("/stream-settings", {
        method: "PATCH",
        body: JSON.stringify({
          minimumDonation: setting.minimumDonation,
          defaultDuration: setting.defaultDuration,
          youtubeEnabled: setting.youtubeEnabled,
          tiktokEnabled: setting.tiktokEnabled,
          gifEnabled: setting.gifEnabled,
          imageEnabled: setting.imageEnabled,
          showDonorName: setting.showDonorName,
          showMessage: setting.showMessage,
          showAmount: setting.showAmount,
        }),
      });
      setSetting(updated);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (!setting) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Media Share</h1>
        <p className="text-muted-foreground">
          Open this widget in a browser, TV, or browser source.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MonitorPlay className="h-4 w-4" /> Widget URL
            <Badge variant="success">Active</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <code className="block break-all rounded-lg bg-muted p-3 text-xs">
            {widgetUrl}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button onClick={copyUrl} variant="outline" size="sm">
              {copied ? (
                <>
                  <ClipboardCheck className="h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy URL
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTestOpen(true)}
            >
              <MonitorPlay className="h-4 w-4" /> Test Widget
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={sendTest}
            >
              <Send className="h-4 w-4" /> Test Donation
            </Button>
            <Button onClick={regenerateKey} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" /> Regenerate Key
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Display Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Minimum Donation (USD)</Label>
              <Input
                type="number"
                min={0}
                value={setting.minimumDonation}
                onChange={(e) =>
                  setSetting({ ...setting, minimumDonation: Number(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Currently {formatUSD(setting.minimumDonation)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Display Duration (seconds)</Label>
              <Input
                type="number"
                min={3}
                max={120}
                value={setting.defaultDuration}
                onChange={(e) =>
                  setSetting({ ...setting, defaultDuration: Number(e.target.value) })
                }
              />
            </div>
          </div>

          {[
            { key: "youtubeEnabled", label: "Enable YouTube" },
            { key: "tiktokEnabled", label: "Enable TikTok" },
            { key: "gifEnabled", label: "Enable GIF" },
            { key: "imageEnabled", label: "Enable Image" },
            { key: "showDonorName", label: "Show Donor Name" },
            { key: "showAmount", label: "Show Amount" },
            { key: "showMessage", label: "Show Message" },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <Label>{item.label}</Label>
              <Switch
                checked={Boolean(setting[item.key as keyof StreamSetting])}
                onCheckedChange={(v) =>
                  setSetting({ ...setting, [item.key]: v })
                }
              />
            </div>
          ))}

          <Button onClick={saveSettings} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </CardContent>
      </Card>

      {/* Preview widget (demo tm.mp4) */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Widget Preview</DialogTitle>
          </DialogHeader>
          <div className="aspect-video w-full overflow-hidden rounded-lg border bg-black">
            {demoUrl ? (
              <iframe
                src={demoUrl}
                className="h-full w-full"
                title="Widget preview"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                No widget yet
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
