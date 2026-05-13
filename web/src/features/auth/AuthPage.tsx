import { FormEvent, useState } from "react";
import { ShieldCheck } from "lucide-react";
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
    <Card className="max-w-xl">
      <CardHeader className="flex-row items-start gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-900">
          <ShieldCheck size={22} />
        </div>
        <div className="grid gap-1">
          <CardTitle className="text-2xl">{mode === "signup" ? "Create your account" : "Welcome back"}</CardTitle>
          <CardDescription>Use this account for the web dashboard and Chrome extension access.</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="grid gap-5">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <Button
            type="button"
            variant="ghost"
            className={cn(mode === "login" && "bg-white text-slate-950 shadow-sm hover:bg-white")}
            onClick={() => setMode("login")}
          >
            Log in
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={cn(mode === "signup" && "bg-white text-slate-950 shadow-sm hover:bg-white")}
            onClick={() => setMode("signup")}
          >
            Create account
          </Button>
        </div>

        <Button asChild variant="outline">
          <a href={googleUrl}>Continue with Google for extension</a>
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

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
      </CardContent>
    </Card>
  );
}
