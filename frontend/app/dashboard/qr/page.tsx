"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { clientApi } from "@/lib/api";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, ClipboardCheck, MonitorPlay, QrCode, Save, RotateCcw } from "lucide-react";

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <div className="flex items-end gap-3">
      <div>
        <Label>{label}</Label>
        <Input
          value={value}
          maxLength={7}
          placeholder="#FFFFFF"
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v) || v === "") onChange(v);
          }}
          className="mt-1 font-mono"
        />
      </div>
      <input
        type="color"
        value={valid ? value : "#ffffff"}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-9 w-14 cursor-pointer rounded-md border bg-white p-1"
        title={`Pick ${label.toLowerCase()}`}
      />
    </div>
  );
}

export default function QRPage() {
  const [streamKey, setStreamKey] = useState("");
  const [username, setUsername] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bgColor, setBgColor] = useState("#F7931A");
  const [qrColor, setQrColor] = useState("#000000");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [s, me] = await Promise.all([
          clientApi<{ streamKey: string; qrBgColor?: string; qrColor?: string }>(
            "/stream-settings",
          ),
          clientApi<{ username: string }>("/users/me"),
        ]);
        setStreamKey(s.streamKey);
        setUsername(me.username);
        if (s.qrBgColor) setBgColor(s.qrBgColor);
        if (s.qrColor) setQrColor(s.qrColor);
      } catch {
        toast.error("Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveColors() {
    setSaving(true);
    try {
      await clientApi("/stream-settings", {
        method: "PATCH",
        body: JSON.stringify({ qrBgColor: bgColor, qrColor }),
      });
      toast.success("Colors saved");
    } catch {
      toast.error("Failed to save colors");
    } finally {
      setSaving(false);
    }
  }

  async function resetColors() {
    setBgColor("#F7931A");
    setQrColor("#000000");
    setSaving(true);
    try {
      await clientApi("/stream-settings", {
        method: "PATCH",
        body: JSON.stringify({ qrBgColor: "#F7931A", qrColor: "#000000" }),
      });
      toast.success("Colors reset to default");
    } catch {
      toast.error("Failed to reset colors");
    } finally {
      setSaving(false);
    }
  }

  const colorParams =
    bgColor !== "#F7931A" || qrColor !== "#000000"
      ? `&bgColor=${bgColor.slice(1)}&qrColor=${qrColor.slice(1)}`
      : "";

  const qrWidgetUrl = streamKey
    ? `${window.location.origin}/widgets/qr?streamKey=${streamKey}${colorParams}`
    : "";
  const donateUrl = username
    ? `${window.location.origin}/donate/${username}`
    : "";

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(qrWidgetUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      toast.error("Failed to copy URL");
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <QrCode className="h-6 w-6 text-primary" /> QR Widget
        </h1>
        <p className="text-muted-foreground">
          Customize the colors, copy the URL, and use it in OBS or a browser
          source.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* URL + colors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">QR Widget URL</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <code className="block break-all rounded-lg bg-muted p-3 text-xs">
              {qrWidgetUrl}
            </code>
            <div className="flex flex-wrap gap-2">
              <Button onClick={copyUrl} variant="outline" size="sm">
                {copiedUrl ? (
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
                onClick={() => setPreviewOpen(true)}
              >
                <MonitorPlay className="h-4 w-4" /> Preview
              </Button>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="mb-3 text-sm font-semibold">Custom Colors</p>
              <div className="flex flex-col gap-4">
                <ColorField
                  label="Background"
                  value={bgColor}
                  onChange={setBgColor}
                />
                <ColorField label="QR Color" value={qrColor} onChange={setQrColor} />
                <Button onClick={saveColors} disabled={saving} size="sm">
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save Colors"}
                </Button>
                <Button onClick={resetColors} disabled={saving} variant="outline" size="sm">
                  <RotateCcw className="h-4 w-4" /> Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preview QR */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">QR Preview</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <div
              className="flex items-center justify-center rounded-xl p-3 shadow"
              style={{ backgroundColor: bgColor }}
            >
              {donateUrl ? (
                <QRCodeSVG
                  value={donateUrl}
                  size={200}
                  level="H"
                  bgColor={bgColor}
                  fgColor={qrColor}
                />
              ) : (
                <Skeleton className="h-[200px] w-[200px]" />
              )}
            </div>
            <code className="break-all rounded bg-muted px-2 py-1 text-xs">
              {donateUrl}
            </code>
          </CardContent>
        </Card>
      </div>

      {/* Preview widget */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>QR Widget Preview</DialogTitle>
          </DialogHeader>
          <div className="aspect-square w-full overflow-hidden rounded-lg border bg-black">
            {qrWidgetUrl ? (
              <iframe
                src={qrWidgetUrl}
                className="h-full w-full"
                title="QR widget preview"
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
