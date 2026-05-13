import { FormEvent, useState } from "react";
import { BrainCircuit, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { cn } from "../../lib/utils";

type AuthPageProps = {
  apiBaseUrl: string;
  onAuth: (mode: AuthMode, email: string, password: string) => Promise<void>;
};

export function AuthPage({ onAuth, apiBaseUrl }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await onAuth(mode, email, password);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign in.");
    }
  }

  const googleUrl = `${apiBaseUrl.replace(/\/+$/, "")}/extension/auth?redirect_uri=${encodeURIComponent(
    window.location.origin + "/auth/callback"
  )}`;

  return (
    <div className="grid max-w-5xl gap-8 lg:grid-cols-[1fr_420px] lg:items-start">
      <section className="grid gap-6">
        <p className="font-mono text-sm font-semibold uppercase text-primary">Agentic inbox workflows</p>
        <h1 className="max-w-3xl text-[2.5rem] font-semibold leading-none text-ink">
          Turn client context into clear next-step replies<span className="ai-caret text-primary">_</span>
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-ink/65">
          Sign in to manage your extension access, activate billing, and keep reply generation tied to your own account.
        </p>
        <ClientReplyPreview />
      </section>

      <Card className="ai-card-hover bg-white/95 backdrop-blur">
      <CardHeader className="flex-row items-start gap-3">
        <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
          <ShieldCheck size={22} />
        </div>
        <div className="grid gap-1">
          <CardTitle className="text-2xl">{mode === "signup" ? "Create your account" : "Welcome back"}</CardTitle>
          <CardDescription>Use this account for the web dashboard and Chrome extension access.</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="grid gap-5">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-secondary p-1">
          <Button
            type="button"
            variant="ghost"
            className={cn(mode === "login" && "bg-white text-ink shadow-sm hover:bg-white")}
            onClick={() => setMode("login")}
          >
            Log in
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={cn(mode === "signup" && "bg-white text-ink shadow-sm hover:bg-white")}
            onClick={() => setMode("signup")}
          >
            Create account
          </Button>
        </div>

        <Button asChild variant="outline" className="normal-case">
          <a href={googleUrl}><Sparkles size={16} />Continue with Google for extension</a>
        </Button>

        <form onSubmit={submit} className="grid gap-4">
          <Label className="grid gap-2">
            Email
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </Label>
          <Label className="grid gap-2">
            Password
            <Input
              type="password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Label>
          <Button type="submit" size="lg">
            {mode === "signup" ? "Create account" : "Log in"}
          </Button>
        </form>

        {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-base font-medium text-danger">{error}</p>}
      </CardContent>
      </Card>
    </div>
  );
}

function ClientReplyPreview() {
  return (
    <div className="ai-panel max-w-2xl rounded-md border border-ink/10 bg-white p-5 shadow-sm">
      <div className="relative z-10 flex items-center justify-between gap-4 border-b border-ink/10 pb-4">
        <div className="flex items-center gap-2 font-mono text-sm font-semibold uppercase text-ink/60">
          <BrainCircuit size={16} className="text-primary" />
          Context engine
        </div>
        <span className="rounded-sm bg-primary px-2 py-1 font-mono text-xs font-semibold uppercase text-white">
          Live draft
        </span>
      </div>
      <div className="relative z-10 mt-4 grid gap-3">
        <div className="flex items-center gap-3 rounded-md bg-secondary p-3">
          <MessageSquareText size={18} className="text-primary" />
          <p className="text-base text-ink/70">Client asks for a timeline, budget clarity, and next step.</p>
        </div>
        <div className="grid gap-2 font-mono text-xs uppercase text-ink/50">
          <span className="h-1.5 w-full rounded-full bg-primary/80 ai-pulse-line" />
          <span className="h-1.5 w-5/6 rounded-full bg-ink/20 ai-pulse-line [animation-delay:240ms]" />
          <span className="h-1.5 w-2/3 rounded-full bg-primary/40 ai-pulse-line [animation-delay:480ms]" />
        </div>
      </div>
    </div>
  );
}
