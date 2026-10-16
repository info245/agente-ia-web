// Every call goes to this app's own /api (proxied to Express), so the session cookie is sent.
const ACCOUNT_KEY = "crm_account_id";

export function getAccountId(): string {
  try {
    return localStorage.getItem(ACCOUNT_KEY) || "";
  } catch {
    return "";
  }
}

export function setAccountId(id: string) {
  try {
    localStorage.setItem(ACCOUNT_KEY, id);
  } catch {}
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public data: any = {}
  ) {
    super(message);
  }
}

// Super admins choose the account; for client users the server ignores account_id.
export async function api<T = Record<string, unknown>>(
  path: string,
  { method = "GET", body }: { method?: string; body?: unknown } = {}
): Promise<T> {
  const url = new URL(`/api${path}`, window.location.origin);
  const accountId = getAccountId();
  if (accountId && path.startsWith("/crm/")) url.searchParams.set("account_id", accountId);

  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/auth/")) {
    // Hard navigation on purpose: this runs outside React and must drop all client state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }
  if (!res.ok || data?.ok === false) {
    throw new ApiError(data?.error || `Error ${res.status}`, res.status, data);
  }
  return data as T;
}
