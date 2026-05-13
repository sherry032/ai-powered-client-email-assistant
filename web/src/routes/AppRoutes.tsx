import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AccountPage } from "../features/account/AccountPage";
import { AuthPage } from "../features/auth/AuthPage";
import { PricingPage } from "../features/pricing/PricingPage";
import { useDashboardStore } from "../store/dashboardStore";

export function AppRoutes() {
  const navigate = useNavigate();
  const {
    apiBaseUrl,
    checkout,
    handleAuth,
    isSignedIn,
    refreshAccount,
    signOut,
    subscription,
    user
  } = useDashboardStore();

  useEffect(() => {
    if (!isSignedIn) return;
    refreshAccount();
  }, [isSignedIn, refreshAccount]);

  async function handleCheckout(plan: PlanId) {
    await checkout(plan);
    navigate("/account");
  }

  async function handleAuthAndNavigate(mode: AuthMode, email: string, password: string) {
    await handleAuth(mode, email, password);
    navigate("/account");
  }

  function handleSignOut() {
    signOut();
    navigate("/auth");
  }

  return (
    <Routes>
      <Route index element={<Navigate to={isSignedIn ? "/account" : "/auth"} replace />} />
      <Route path="/auth" element={<AuthPage onAuth={handleAuthAndNavigate} apiBaseUrl={apiBaseUrl} />} />
      <Route
        path="/pricing"
        element={
          <PricingPage
            isSignedIn={isSignedIn}
            onCheckout={handleCheckout}
            onRequireAuth={() => navigate("/auth")}
          />
        }
      />
      <Route
        path="/account"
        element={
          <AccountPage
            user={user}
            subscription={subscription}
            onRefresh={refreshAccount}
            onSignOut={handleSignOut}
            onPricing={() => navigate("/pricing")}
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
