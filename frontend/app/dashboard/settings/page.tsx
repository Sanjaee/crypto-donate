import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Widget configuration lives in the{" "}
          <span className="font-medium">Media Share</span> menu.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            • Payments are processed via Midtrans and confirmed through the
            webhook.
          </p>
          <p>• Balance only increases after a payment is verified.</p>
          <p>• Withdrawals will be available in a future phase.</p>
        </CardContent>
      </Card>
    </div>
  );
}
