import type { ReactNode } from "react";
import { Mail } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useDashboardStore } from "../../store/dashboardStore";
import { buttonVariants, Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { cn } from "../../lib/utils";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const apiBaseUrl = useDashboardStore((state) => state.apiBaseUrl);
  const isSignedIn = useDashboardStore((state) => state.isSignedIn);
  const setApiBaseUrl = useDashboardStore((state) => state.setApiBaseUrl);
  const status = useDashboardStore((state) => state.status);

  return (
    <main className="grid min-h-screen bg-slate-100 text-slate-950 lg:grid-cols-[280px_1fr]">
      <aside className="flex flex-col gap-6 border-b border-slate-200 bg-white p-6 lg:border-b-0 lg:border-r">
        <Brand />
        <Navigation isSignedIn={isSignedIn} />

        <Label className="grid gap-2">
          Backend URL
          <Input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
        </Label>

        {status && <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{status}</p>}
      </aside>

      <section className="p-6 sm:p-8 lg:p-10">{children}</section>
    </main>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 place-items-center rounded-lg bg-slate-900 text-white">
        <Mail size={20} />
      </div>
      <div>
        <strong className="block leading-tight">Client Message Assistant</strong>
        <span className="block text-sm text-slate-500">For independent professionals</span>
      </div>
    </div>
  );
}

function Navigation({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <nav className="grid gap-1.5">
      <NavButton to="/auth">Sign in</NavButton>
      <NavButton to="/pricing">Pricing</NavButton>
      <NavButton to="/account" disabled={!isSignedIn}>Account</NavButton>
    </nav>
  );
}

function NavButton({ children, disabled, to }: { children: ReactNode; disabled?: boolean; to: string }) {
  if (disabled) {
    return (
      <Button variant="ghost" justify="start" disabled>
        {children}
      </Button>
    );
  }

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(buttonVariants({ variant: isActive ? "secondary" : "ghost", justify: "start" }), "w-full")
      }
    >
      {children}
    </NavLink>
  );
}
