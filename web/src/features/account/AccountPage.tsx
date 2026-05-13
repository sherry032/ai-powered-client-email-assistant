import type { ReactNode } from "react";
import { Activity, CreditCard, LogOut, RefreshCw } from "lucide-react";
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
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-sm font-semibold uppercase text-primary">Dashboard</p>
          <h1 className="mt-2 text-[2.5rem] font-semibold leading-none text-ink">Account</h1>
          <p className="mt-2 text-lg text-ink/60">{user.email}</p>
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
          <strong className="text-2xl font-semibold text-ink">{periodEnd}</strong>
        </Metric>
        <Metric label="Extension access">
          <strong className="text-2xl font-semibold text-ink">{valid ? "Enabled" : "Disabled"}</strong>
        </Metric>
      </section>

      <Card className="ai-card-hover max-w-3xl bg-white/95 backdrop-blur">
        <CardHeader className="flex-row items-start gap-3">
          <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
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

      <Card className="ai-panel max-w-3xl bg-white/95">
        <CardHeader className="relative z-10 flex-row items-start gap-3">
          <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
            <Activity size={22} />
          </div>
          <div className="grid gap-1">
            <CardTitle>Reply engine</CardTitle>
            <CardDescription>Account-linked generation status for your Chrome extension.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="relative z-10 grid gap-3">
          {["Context capture", "Subscription gate", "Draft generation"].map((item, index) => (
            <div key={item} className="grid gap-2 rounded-md border border-ink/10 bg-secondary p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm font-semibold uppercase text-ink/60">{item}</span>
                <span className="font-mono text-xs font-semibold uppercase text-primary">Ready</span>
              </div>
              <span
                className="h-1.5 rounded-full bg-primary ai-pulse-line"
                style={{ animationDelay: `${index * 220}ms` }}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card className="ai-card-hover bg-white/95 backdrop-blur">
      <CardContent className="grid gap-2 p-5">
        <span className="font-mono text-sm font-semibold uppercase text-ink/50">{label}</span>
        {children}
      </CardContent>
    </Card>
  );
}
