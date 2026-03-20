import axios from "axios";
import { resolveMockResponse } from "./mockBackend";
import { apiBaseForRequests, hasExplicitApiBase, markRuntimeFallback, markRuntimeLive, useMockApi } from "./runtimeConfig";

export const api = axios.create({
  baseURL: apiBaseForRequests,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
});

if (useMockApi) {
  api.interceptors.request.use(async (config) => {
    const mockData = await resolveMockResponse(config);
    if (mockData !== null && mockData !== undefined) {
      config.adapter = async () => ({
        data: mockData,
        status: 200,
        statusText: "OK",
        headers: {},
        config,
        request: {},
      });
    }
    return config;
  });
} else {
  api.interceptors.response.use(
    (response) => {
      markRuntimeLive();
      return response;
    },
    async (error) => {
      const config = error?.config || {};
      if (config.__mockFallbackUsed) return Promise.reject(error);

      const status = Number(error?.response?.status || 0);
      const code = String(error?.code || "");
      const data = error?.response?.data;
      const backendStyle404 =
        status === 404 &&
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        (Object.prototype.hasOwnProperty.call(data, "detail") || Object.prototype.hasOwnProperty.call(data, "message"));
      const shouldFallback404 = status === 404 && !backendStyle404;
      const retryable =
        !status ||
        status >= 500 ||
        shouldFallback404 ||
        code === "ERR_NETWORK" ||
        code === "ECONNABORTED" ||
        code === "ERR_BAD_RESPONSE";

      if (!retryable) return Promise.reject(error);

      const mockData = await resolveMockResponse(config);
      if (mockData === null || mockData === undefined) {
        return Promise.reject(error);
      }

      const reason = status ? `http_${status}` : code || "network";
      markRuntimeFallback(hasExplicitApiBase ? `live_${reason}` : reason);
      return {
        data: mockData,
        status: 200,
        statusText: "OK",
        headers: { "x-runtime-mode": "fallback" },
        config: { ...config, __mockFallbackUsed: true },
        request: {},
      };
    },
  );
}
