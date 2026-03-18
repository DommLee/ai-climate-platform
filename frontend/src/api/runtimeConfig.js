const devFallbackBaseUrl = "http://localhost:8000";
const rawApiBase = String(import.meta.env.VITE_API_BASE_URL ?? "").trim();
const invalidApiBaseValues = new Set(["", "VITE_API_BASE_URL", "undefined", "null"]);

const hasExplicitApiBase = !invalidApiBaseValues.has(rawApiBase);
const normalizedApiBase = hasExplicitApiBase ? rawApiBase.replace(/\/+$/, "") : "";
const apiBaseForRequests = hasExplicitApiBase ? normalizedApiBase : import.meta.env.DEV ? devFallbackBaseUrl : "";
const useMockApi = import.meta.env.VITE_ENABLE_MOCK_API === "true" || (import.meta.env.PROD && !hasExplicitApiBase);

export {
  apiBaseForRequests,
  hasExplicitApiBase,
  normalizedApiBase,
  useMockApi,
};
