import type { ReactNode } from "react";
import { CreditCard, LogOut, RefreshCw } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

type AccountPageProps = {
  user: User | null;
  subscription: Subscription | null;
  onRefresh: () => Promise<void>;
  onSignOut: () => void;
  onPricing: () => void;
};

export function AccountPage({ user, subscription, onRefresh, onSignOut, onPricing }: AccountPageProps) {
  if (!user) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Sign in to view your subscription dashboard.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const valid = Boolean(subscription?.is_valid);
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end * 1000).toLocaleDateString()
    : "Not available";

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal text-slate-900">Account</h1>
          <p className="mt-1 text-slate-600">{user.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onRefresh}>
            <RefreshCw size={16} />
            Refresh
          </Button>
          <Button variant="secondary" onClick={onSignOut}>
            <LogOut size={16} />
            Sign out
          </Button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Status">
          <Badge variant={valid ? "success" : "destructive"}>{subscription?.status || "Unknown"}</Badge>
        </Metric>
        <Metric label="Current period ends">
          <strong className="text-lg font-semibold text-slate-900">{periodEnd}</strong>
        </Metric>
        <Metric label="Extension access">
          <strong className="text-lg font-semibold text-slate-900">{valid ? "Enabled" : "Disabled"}</strong>
        </Metric>
      </section>

      <Card className="max-w-3xl">
        <CardHeader className="flex-row items-start gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-900">
            <CreditCard size={22} />
          </div>
          <div className="grid gap-1">
            <CardTitle>Subscription</CardTitle>
            <CardDescription>
              {valid ? "Your account can generate client replies." : "Choose a plan to enable AI drafts."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button onClick={onPricing}>{valid ? "Change plan" : "View pricing"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="grid gap-2 p-5">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        {children}
      </CardContent>
    </Card>
  );
}
