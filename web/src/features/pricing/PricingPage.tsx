import { Check } from "lucide-react";
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
    <div className="grid gap-6">
      <div className="grid max-w-3xl gap-2">
        <h1 className="text-3xl font-semibold tracking-normal text-slate-900">Pricing</h1>
        <p className="text-base leading-7 text-slate-600">
          Start with a trial, then activate a plan when client replies become part of your daily workflow.
        </p>
      </div>

      <div className="grid max-w-5xl gap-5 md:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.id} className="grid">
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="flex items-baseline gap-1">
                <strong className="text-4xl font-semibold text-slate-900">{plan.price}</strong>
                <span className="text-sm text-slate-500">/month</span>
              </div>
              <ul className="grid gap-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-slate-700">
                    <Check size={16} className="text-emerald-600" />
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
