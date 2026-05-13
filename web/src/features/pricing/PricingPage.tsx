import { Check, Cpu } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../components/ui/card";

type PricingPageProps = {
  isSignedIn: boolean;
  onCheckout: (plan: PlanId) => Promise<void>;
  onRequireAuth: () => void;
};

const plans: Array<{
  id: PlanId;
  name: string;
  price: string;
  description: string;
  features: string[];
}> = [
  {
    id: "solo",
    name: "Solo",
    price: "$12",
    description: "For consultants, coaches, designers, and solo operators.",
    features: ["500 AI replies per month", "Gmail context capture", "Tone and signature defaults", "Chrome extension access"]
  },
  {
    id: "studio",
    name: "Studio",
    price: "$29",
    description: "For small practices that handle a larger client inbox.",
    features: ["2,000 AI replies per month", "Priority model capacity", "Usage reporting", "Early team features"]
  }
];

export function PricingPage({ isSignedIn, onCheckout, onRequireAuth }: PricingPageProps) {
  return (
    <div className="grid gap-8">
      <div className="grid max-w-3xl gap-3">
        <p className="flex items-center gap-2 font-mono text-sm font-semibold uppercase text-primary">
          <Cpu size={16} />
          Plans
        </p>
        <h1 className="text-[2.5rem] font-semibold leading-none text-ink">Pricing</h1>
        <p className="text-lg leading-8 text-ink/65">
          Start with a trial, then activate a plan when client replies become part of your daily workflow.
        </p>
      </div>

      <div className="grid max-w-5xl gap-5 md:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.id} className="ai-card-hover grid overflow-hidden bg-white/95 backdrop-blur">
            {plan.id === "solo" && <div className="h-2 bg-primary" />}
            <CardHeader>
              <p className="font-mono text-xs font-semibold uppercase text-ink/45">
                {plan.id === "solo" ? "Recommended node" : "Scale node"}
              </p>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="flex items-baseline gap-1">
                <strong className="text-[2.5rem] font-semibold text-ink">{plan.price}</strong>
                <span className="font-mono text-sm font-semibold uppercase text-ink/50">/month</span>
              </div>
              <ul className="grid gap-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-base text-ink/70">
                    <Check size={16} className="text-success" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={() => (isSignedIn ? onCheckout(plan.id) : onRequireAuth())}>
                {isSignedIn ? "Activate plan" : "Sign in to activate"}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
