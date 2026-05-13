/// <reference types="vite/client" />

type AuthMode = "login" | "signup";
type PlanId = "solo" | "studio";

type User = {
  id: number;
  email: string;
};

type Subscription = {
  status?: string;
  is_valid?: boolean;
  current_period_end?: number | null;
};

type AuthResponse = {
  token: string;
  user: User;
};

type CheckoutResponse = {
  subscription: Subscription;
};
