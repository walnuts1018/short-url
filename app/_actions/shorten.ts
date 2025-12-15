"use server";

import { domainToASCII } from "node:url";

type ShortenResponse = {
  id: string;
};

export type ShortenActionState =
  | { status: "idle" }
  | { status: "success"; id: string }
  | { status: "error"; message: string };

function isLikelyIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^[0-9]+$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

function isValidHostname(hostnameInput: string): boolean {
  const hostname = hostnameInput.toLowerCase();

  if (!hostname) return false;
  if (hostname === "localhost") return true;

  if (hostname.includes(":")) return true;
  if (isLikelyIpv4(hostname)) return true;

  if (!hostname.includes(".")) return false;
  if (hostname.startsWith(".") || hostname.endsWith(".")) return false;

  const labels = hostname.split(".");
  if (labels.some((l) => l.length === 0)) return false;
  if (labels.length < 2) return false;

  const tld = labels.at(-1);
  if (!tld || tld.length < 2) return false;

  for (const label of labels) {
    if (label.length < 1 || label.length > 63) return false;
    if (!/^[a-z0-9-]+$/.test(label)) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
  }

  return true;
}

function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value) {
    throw new Error("URLを入力してください");
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
  const withScheme = hasScheme ? value : `https://${value}`;

  if (!withScheme.toLowerCase().startsWith("https:")) {
    throw new Error("https:// のURLのみ対応しています");
  }

  const encoded = encodeURI(withScheme);

  try {
    const parsed = new URL(encoded);
    if (parsed.protocol !== "https:") {
      throw new Error();
    }

    const asciiHost = domainToASCII(parsed.hostname);
    if (!asciiHost || !isValidHostname(asciiHost)) {
      throw new Error("ドメイン名が正しくありません");
    }

    return parsed.toString();
  } catch (e) {
    if (e instanceof Error && e.message) {
      throw e;
    }
    throw new Error("URLの形式が正しくありません");
  }
}

function getApiEndpoint(): string {
  return (
    process.env.API_ENDPOINT ||
    process.env.NEXT_PUBLIC_API_ENDPOINT ||
    "http://localhost:8080"
  );
}

export async function shortenAction(
  _prevState: ShortenActionState,
  formData: FormData
): Promise<ShortenActionState> {
  const urlField = formData.get("url");
  const rawUrl = typeof urlField === "string" ? urlField : "";

  let url: string;
  try {
    url = normalizeUrl(rawUrl);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "URLの形式が正しくありません";
    return { status: "error", message };
  }

  const endpoint = new URL("/api/v1/shorten", getApiEndpoint());
  let res: Response;
  try {
    res = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ url }),
      cache: "no-store",
    });
  } catch {
    return {
      status: "error",
      message:
        "サーバーに接続できませんでした。時間をおいて再度お試しください。",
    };
  }

  if (!res.ok) {
    const message = (await res.text().catch(() => "")) || "短縮に失敗しました";
    return { status: "error", message };
  }

  const data = (await res.json()) as ShortenResponse;
  return { status: "success", id: data.id };
}
