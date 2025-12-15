"use server";

import { revalidatePath } from "next/cache";
import { headers as nextHeaders } from "next/headers";

export type AdminLinkListItem = {
  id: string;
  original_url: string;
  created_at: string;
  expires_at: string | null;
  enabled: boolean;
  disabled_at: string | null;
  last_access_at: string | null;
  creator_ip: string | null;
  creator_user_agent: string | null;
  creator_request_id: string | null;
};

export type AdminLinkListResponse = {
  items: AdminLinkListItem[];
  next_page_state: string | null;
};

export type AdminAccessLogItem = {
  ts: string;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  status_code: number;
};

export type AdminAccessLogResponse = {
  items: AdminAccessLogItem[];
};

function getApiEndpoint(): string {
  return (
    process.env.API_ENDPOINT ||
    process.env.NEXT_PUBLIC_API_ENDPOINT ||
    "http://localhost:8080"
  );
}

async function backendFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = getApiEndpoint();
  const url = new URL(path, base).toString();

  const outgoing = new Headers(init?.headers);
  const incoming = await nextHeaders();
  const ua = incoming.get("user-agent");
  if (ua && !outgoing.has("user-agent")) {
    outgoing.set("user-agent", ua);
  }

  // Forward client IP to backend.
  // Prefer Cloudflare's cf-connecting-ip; otherwise fall back to x-forwarded-for/x-real-ip.
  const cfConnectingIp = incoming.get("cf-connecting-ip")?.trim();
  const xForwardedFor = incoming.get("x-forwarded-for")?.trim();
  const xRealIp = incoming.get("x-real-ip")?.trim();
  const forwardedIp =
    cfConnectingIp ||
    xForwardedFor?.split(",").map((s) => s.trim()).filter(Boolean)[0] ||
    xRealIp ||
    "";
  if (forwardedIp && !outgoing.has("cf-connecting-ip")) {
    outgoing.set("cf-connecting-ip", forwardedIp);
  }

  return fetch(url, {
    ...init,
    cache: "no-store",
    headers: outgoing,
  });
}

export async function listAdminLinks(args?: {
  limit?: number;
  pageState?: string | null;
}): Promise<AdminLinkListResponse> {
  const params = new URLSearchParams();
  const limit = args?.limit;
  if (typeof limit === "number" && Number.isFinite(limit)) {
    params.set("limit", String(Math.max(1, Math.min(100, Math.floor(limit)))));
  }
  const pageState = args?.pageState;
  if (typeof pageState === "string" && pageState.trim() !== "") {
    params.set("page_state", pageState);
  }

  const path = params.size
    ? `/api/v1/admin/links?${params.toString()}`
    : "/api/v1/admin/links";
  const res = await backendFetch(path, { method: "GET" });
  if (!res.ok) {
    const msg = (await res.text().catch(() => "")) || "Failed to list links";
    throw new Error(msg);
  }

  return (await res.json()) as AdminLinkListResponse;
}

export async function listAdminAccessLogs(
  id: string,
  args?: { limit?: number }
): Promise<AdminAccessLogResponse> {
  const safeId = (id ?? "").trim();
  if (!safeId) {
    throw new Error("Missing id");
  }

  const params = new URLSearchParams();
  const limit = args?.limit;
  if (typeof limit === "number" && Number.isFinite(limit)) {
    params.set("limit", String(Math.max(1, Math.min(500, Math.floor(limit)))));
  }

  const basePath = `/api/v1/admin/links/${encodeURIComponent(safeId)}/accesses`;
  const path = params.size ? `${basePath}?${params.toString()}` : basePath;
  const res = await backendFetch(path, { method: "GET" });
  if (!res.ok) {
    const msg =
      (await res.text().catch(() => "")) || "Failed to list access logs";
    throw new Error(msg);
  }

  return (await res.json()) as AdminAccessLogResponse;
}

export async function disableLinkAction(formData: FormData): Promise<void> {
  const rawId = formData.get("id");
  const id = (typeof rawId === "string" ? rawId : "").trim();
  if (!id) return;

  const res = await backendFetch(
    `/api/v1/admin/links/${encodeURIComponent(id)}/disable`,
    {
      method: "POST",
    }
  );
  if (!res.ok) {
    const msg = (await res.text().catch(() => "")) || "Failed to disable";
    throw new Error(msg);
  }

  revalidatePath("/pages/admin");
}

export async function restoreLinkAction(formData: FormData): Promise<void> {
  const rawId = formData.get("id");
  const id = (typeof rawId === "string" ? rawId : "").trim();
  if (!id) return;

  const res = await backendFetch(
    `/api/v1/admin/links/${encodeURIComponent(id)}/restore`,
    {
      method: "POST",
    }
  );
  if (!res.ok) {
    const msg = (await res.text().catch(() => "")) || "Failed to restore";
    throw new Error(msg);
  }

  revalidatePath("/pages/admin");
}
