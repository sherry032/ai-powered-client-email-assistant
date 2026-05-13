import { create } from "zustand";
import { createApi } from "../lib/api";
import { API_BASE_URL_KEY, API_DEFAULT, TOKEN_KEY, USER_KEY, readJson } from "../lib/storage";

type DashboardState = {
  apiBaseUrl: string;
  isSignedIn: boolean;
  status: string;
  subscription: Subscription | null;
  user: User | null;
  checkout: (plan: PlanId) => Promise<void>;
  handleAuth: (mode: AuthMode, email: string, password: string) => Promise<void>;
  refreshAccount: () => Promise<void>;
  setApiBaseUrl: (value: string) => void;
  signOut: () => void;
};

const initialToken = localStorage.getItem(TOKEN_KEY) || "";
const initialUser = readJson<User>(USER_KEY);

export const useDashboardStore = create<DashboardState>((set, get) => ({
  apiBaseUrl: localStorage.getItem(API_BASE_URL_KEY) || API_DEFAULT,
  isSignedIn: Boolean(initialToken && initialUser),
  status: "",
  subscription: null,
  user: initialUser,

  setApiBaseUrl: (value) => {
    localStorage.setItem(API_BASE_URL_KEY, value);
    set({ apiBaseUrl: value });
  },

  handleAuth: async (mode, email, password) => {
    set({ status: mode === "signup" ? "Creating account..." : "Signing in..." });
    const data = await api().auth(mode, email, password);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    set({ isSignedIn: true, status: "Signed in.", user: data.user });
  },

  refreshAccount: async () => {
    if (!getToken()) return;

    try {
      const subscription = await api().subscription();
      set({ subscription });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : "Could not refresh account." });
    }
  },

  checkout: async (plan) => {
    set({ status: "Starting checkout..." });
    const data = await api().checkout(plan);
    set({ status: "Subscription updated.", subscription: data.subscription });
  },

  signOut: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ isSignedIn: false, status: "Signed out.", subscription: null, user: null });
  }
}));

function api() {
  return createApi(useDashboardStore.getState().apiBaseUrl, getToken());
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}
