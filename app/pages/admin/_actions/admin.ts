"use server";

import { revalidatePath } from "next/cache";

export type AdminLinkListItem = {
  id: string;
  original_url: string;
  created_at: string;
  expires_at: string | null;
  enabled: boolean;
  disabled_at: string | null;
  last_access_at: string | null;
};

function getApiEndpoint(): string {
  return (
    process.env.API_ENDPOINT ||
    process.env.NEXT_PUBLIC_API_ENDPOINT ||
    "http://localhost:8080"
  );
}

async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getApiEndpoint();
  const url = new URL(path, base).toString();
  return fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.headers ?? {}),
    },
  });
}

export async function listAdminLinks(): Promise<AdminLinkListItem[]> {
  const res = await backendFetch("/api/v1/admin/links", {
    method: "GET",
  });
  if (!res.ok) {
    const msg = (await res.text().catch(() => "")) || "Failed to list links";
    throw new Error(msg);
  }
  return (await res.json()) as AdminLinkListItem[];
}

export async function disableLinkAction(formData: FormData): Promise<void> {
  const rawId = formData.get("id");
  const id = (typeof rawId === "string" ? rawId : "").trim();
  if (!id) return;

  const res = await backendFetch(`/api/v1/admin/links/${encodeURIComponent(id)}/disable`, {
    method: "POST",
  });
  if (!res.ok) {
    const msg = (await res.text().catch(() => "")) || "Failed to disable";
    throw new Error(msg);
  }

  revalidatePath("/admin");
}

export async function restoreLinkAction(formData: FormData): Promise<void> {
  const rawId = formData.get("id");
  const id = (typeof rawId === "string" ? rawId : "").trim();
  if (!id) return;

  const res = await backendFetch(`/api/v1/admin/links/${encodeURIComponent(id)}/restore`, {
    method: "POST",
  });
  if (!res.ok) {
    const msg = (await res.text().catch(() => "")) || "Failed to restore";
    throw new Error(msg);
  }

  revalidatePath("/admin");
}
