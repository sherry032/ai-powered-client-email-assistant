import type { ReactNode } from "react";
import { Bot, Mail } from "lucide-react";
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
    <main className="ai-grid grid min-h-screen bg-secondary text-ink lg:grid-cols-[304px_1fr]">
      <aside className="flex flex-col gap-6 border-b border-ink/10 bg-white/92 p-6 backdrop-blur lg:border-b-0 lg:border-r">
        <Brand />
        <Navigation isSignedIn={isSignedIn} />

        <Label className="grid gap-2">
          Backend URL
          <Input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
        </Label>

        <div className="mt-auto grid gap-3">
          <div className="ai-panel rounded-md border border-primary/20 bg-secondary p-3">
            <div className="relative z-10 flex items-center gap-2 font-mono text-xs font-semibold uppercase text-ink/60">
              <Bot size={14} className="text-primary" />
              Agent status
            </div>
            <div className="relative z-10 mt-3 grid gap-2">
              <span className="h-1 rounded-full bg-primary ai-pulse-line" />
              <span className="h-1 w-3/4 rounded-full bg-ink/20 ai-pulse-line [animation-delay:320ms]" />
            </div>
          </div>
          {status && <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-base text-ink/70">{status}</p>}
        </div>
      </aside>

      <section className="p-6 sm:p-8 lg:p-10">
        <div className="ai-rise">{children}</div>
      </section>
    </main>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 place-items-center rounded-md bg-primary text-white shadow-[0_0_28px_rgba(255,87,1,0.35)]">
        <Mail size={20} />
      </div>
      <div>
        <strong className="block text-lg leading-tight">Client Message Assistant</strong>
        <span className="block font-mono text-xs font-semibold uppercase text-ink/50">For independent professionals</span>
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
