export const API_DEFAULT = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
export const API_BASE_URL_KEY = "cma_api_base_url";
export const TOKEN_KEY = "cma_web_token";
export const USER_KEY = "cma_web_user";

export function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") as T | null;
  } catch {
    return null;
  }
}
