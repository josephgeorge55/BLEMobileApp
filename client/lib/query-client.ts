import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Gets the base URL for the Express API server (e.g., "http://localhost:3000")
 * @returns {string} The API base URL
 */
const PRODUCTION_DOMAIN = "bladephoneapp.replit.app";

export function getApiUrl(): string {
  const host = process.env.EXPO_PUBLIC_DOMAIN || PRODUCTION_DOMAIN;

  const url = new URL(`https://${host}`);

  return url.href;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
      signal: controller.signal,
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

const retryDelay = (attemptIndex: number) =>
  Math.min(1000 * 2 ** attemptIndex, 10000);

const shouldRetry = (failureCount: number, error: unknown) => {
  if (error instanceof Error && error.message.match(/^(4\d{2})/)) {
    return false;
  }
  return failureCount < 2;
};

const shouldRetryMutation = (failureCount: number, error: unknown) => {
  if (error instanceof Error && error.message.match(/^(4\d{2})/)) {
    return false;
  }
  return failureCount < 1;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: shouldRetry,
      retryDelay,
      networkMode: 'online',
    },
    mutations: {
      retry: shouldRetryMutation,
      retryDelay,
    },
  },
});
