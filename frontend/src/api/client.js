import axios from "axios";
import { resolveMockResponse } from "./mockBackend";

const devFallbackBaseUrl = "http://localhost:8000";
const hasExplicitApiBase = Boolean(import.meta.env.VITE_API_BASE_URL);
const useMockApi = import.meta.env.VITE_ENABLE_MOCK_API === "true" || (import.meta.env.PROD && !hasExplicitApiBase);
const baseURL = hasExplicitApiBase ? import.meta.env.VITE_API_BASE_URL : import.meta.env.DEV ? devFallbackBaseUrl : "";

export const api = axios.create({
  baseURL,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
});

if (useMockApi) {
  api.interceptors.request.use((config) => {
    const mockData = resolveMockResponse(config);
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
}
