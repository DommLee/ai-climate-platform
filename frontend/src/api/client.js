import axios from "axios";
import { resolveMockResponse } from "./mockBackend";
import { apiBaseForRequests, useMockApi } from "./runtimeConfig";

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
}
