const devFallbackBaseUrl = "http://localhost:8000";
const rawApiBase = String(import.meta.env.VITE_API_BASE_URL ?? "").trim();
const invalidApiBaseValues = new Set(["", "VITE_API_BASE_URL", "undefined", "null"]);

const hasExplicitApiBase = !invalidApiBaseValues.has(rawApiBase);
const normalizedApiBase = hasExplicitApiBase ? rawApiBase.replace(/\/+$/, "") : "";
const apiBaseForRequests = hasExplicitApiBase ? normalizedApiBase : import.meta.env.DEV ? devFallbackBaseUrl : "";
const useMockApi = import.meta.env.VITE_ENABLE_MOCK_API === "true" || (import.meta.env.PROD && !hasExplicitApiBase);
const runtimeListeners = new Set();

export const RuntimeMode = Object.freeze({
  LIVE: "LIVE",
  LIVE_WITH_FALLBACK: "LIVE_WITH_FALLBACK",
  DEMO: "DEMO",
});

const runtimeState = {
  mode: useMockApi ? RuntimeMode.DEMO : RuntimeMode.LIVE,
  fallbackActive: useMockApi,
  reason: useMockApi ? "mock_mode" : "live_mode",
  apiBase: apiBaseForRequests || null,
  hasExplicitApiBase,
};

function emitRuntimeChange() {
  const snapshot = { ...runtimeState };
  runtimeListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // Ignore subscriber errors to keep runtime status stable.
    }
  });
}

export function subscribeRuntimeStatus(listener) {
  if (typeof listener !== "function") return () => {};
  runtimeListeners.add(listener);
  listener({ ...runtimeState });
  return () => runtimeListeners.delete(listener);
}

export function getRuntimeStatus() {
  return { ...runtimeState };
}

export function markRuntimeLive() {
  if (runtimeState.mode === RuntimeMode.DEMO) return;
  if (runtimeState.mode === RuntimeMode.LIVE && !runtimeState.fallbackActive) return;
  runtimeState.mode = RuntimeMode.LIVE;
  runtimeState.fallbackActive = false;
  runtimeState.reason = "live_response";
  emitRuntimeChange();
}

export function markRuntimeFallback(reason = "live_request_failed") {
  if (runtimeState.mode === RuntimeMode.DEMO) return;
  runtimeState.mode = RuntimeMode.LIVE_WITH_FALLBACK;
  runtimeState.fallbackActive = true;
  runtimeState.reason = String(reason || "fallback");
  emitRuntimeChange();
}

export {
  apiBaseForRequests,
  hasExplicitApiBase,
  normalizedApiBase,
  useMockApi,
};
