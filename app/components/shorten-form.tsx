"use client";

import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { MdCheckCircle, MdClose, MdErrorOutline } from "react-icons/md";

import { shortenAction, type ShortenActionState } from "../_actions/shorten";
import { CopyButton } from "./copy-button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ShortenHistoryItem = {
  id: string;
  shortPath: string;
  originalUrl: string;
  createdAt: number;
};

const SHORTEN_HISTORY_STORAGE_KEY_V1 = "short-url:history:v1";
const SHORTEN_HISTORY_STORAGE_KEY_V2 = "short-url:history:v2";
const MAX_HISTORY_ITEMS = 20;

function normalizeShortPath(value: string): string | null {
  if (!value) return null;
  if (value.startsWith("/")) return value;
  try {
    const u = new URL(value);
    const path = u.pathname || "/";
    return path.startsWith("/") ? path : `/${path}`;
  } catch {
    return null;
  }
}

function loadShortenHistory(): ShortenHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const rawV2 = window.localStorage.getItem(SHORTEN_HISTORY_STORAGE_KEY_V2);
    const rawV1 = window.localStorage.getItem(SHORTEN_HISTORY_STORAGE_KEY_V1);
    const raw = rawV2 ?? rawV1;
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const mapped = parsed
      .map((item): ShortenHistoryItem | null => {
        if (!item || typeof item !== "object") return null;
        const maybe = item as Partial<
          ShortenHistoryItem & { shortUrl?: string }
        >;

        const id = typeof maybe.id === "string" ? maybe.id : null;
        const createdAt =
          typeof maybe.createdAt === "number" ? maybe.createdAt : null;
        const originalUrl =
          typeof maybe.originalUrl === "string" ? maybe.originalUrl : "";

        const shortPath =
          typeof maybe.shortPath === "string"
            ? normalizeShortPath(maybe.shortPath)
            : typeof maybe.shortUrl === "string"
              ? normalizeShortPath(maybe.shortUrl)
              : null;

        if (!id || createdAt === null || !shortPath) return null;
        return { id, shortPath, originalUrl, createdAt };
      })
      .filter((v): v is ShortenHistoryItem => v !== null)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_HISTORY_ITEMS);

    if (!rawV2 && mapped.length > 0) {
      // Migrate v1 -> v2 once.
      saveShortenHistory(mapped);
    }

    return mapped;
  } catch {
    return [];
  }
}

function saveShortenHistory(items: ShortenHistoryItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SHORTEN_HISTORY_STORAGE_KEY_V2,
      JSON.stringify(items)
    );
  } catch {
    // ignore
  }
}

export function ShortenForm({
  defaultUrl,
  requestOrigin,
}: {
  defaultUrl?: string;
  requestOrigin?: string;
}) {
  const { t } = useTranslation();
  const errorId = useId();
  const [state, formAction, isPending] = useActionState<
    ShortenActionState,
    FormData
  >(shortenAction, { status: "idle" });

  const [url, setUrl] = useState(defaultUrl ?? "");
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const lastSubmittedNormalizedRef = useRef<string>("");
  const toastTimerRef = useRef<number | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastVariant, setToastVariant] = useState<"default" | "destructive">(
    "default"
  );
  const [toastTitle, setToastTitle] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string>("");
  const [successOpen, setSuccessOpen] = useState(false);
  const [lastOriginalUrl, setLastOriginalUrl] = useState<string>("");
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [history, setHistory] = useState<ShortenHistoryItem[]>(() =>
    loadShortenHistory()
  );

  const validation = useMemo(() => {
    const value = url.trim();
    if (!value) {
      return {
        normalized: null as string | null,
        error: t("form.validation.required"),
      };
    }

    const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
    const withScheme = hasScheme ? value : `https://${value}`;

    if (hasScheme && !value.toLowerCase().startsWith("https:")) {
      return {
        normalized: null as string | null,
        error: t("form.validation.httpsOnly"),
      };
    }

    const encoded = encodeURI(withScheme);

    try {
      const parsed = new URL(encoded);
      if (parsed.protocol !== "https:") {
        return {
          normalized: null as string | null,
          error: t("form.validation.httpsOnly"),
        };
      }

      const hostname = parsed.hostname.toLowerCase();
      const isLocalhost = hostname === "localhost";
      const isIpv4 = (() => {
        const parts = hostname.split(".");
        if (parts.length !== 4) return false;
        return parts.every((p) => {
          if (!/^[0-9]+$/.test(p)) return false;
          const n = Number(p);
          return n >= 0 && n <= 255;
        });
      })();
      const isIpv6 = hostname.includes(":");

      if (!isLocalhost && !isIpv4 && !isIpv6) {
        if (!hostname.includes(".")) {
          return {
            normalized: null as string | null,
            error: t("form.validation.domainInvalid"),
          };
        }

        if (hostname.startsWith(".") || hostname.endsWith(".")) {
          return {
            normalized: null as string | null,
            error: t("form.validation.domainInvalid"),
          };
        }

        const labels = hostname.split(".");
        const tld = labels.at(-1);
        if (!tld || tld.length < 2) {
          return {
            normalized: null as string | null,
            error: t("form.validation.domainInvalid"),
          };
        }
      }

      return { normalized: parsed.toString(), error: null as string | null };
    } catch {
      return {
        normalized: null as string | null,
        error: t("form.validation.invalid"),
      };
    }
  }, [t, url]);

  const normalized = validation.normalized;
  const errorMessage = validation.error;

  const showError = (touched || submitted) && errorMessage;

  const shortPath = state.status === "success" ? `/${state.id}` : null;
  const shortUrl =
    shortPath && requestOrigin ? `${requestOrigin}${shortPath}` : null;
  const shortUrlForUi = shortUrl || shortPath;

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = useMemo(() => {
    return (args: {
      variant: "default" | "destructive";
      title: string;
      message?: string;
      durationMs?: number;
    }) => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }

      setToastVariant(args.variant);
      setToastTitle(args.title);
      setToastMessage(args.message ?? "");
      setToastVisible(true);

      // Re-trigger enter animation even if already open.
      setToastOpen(false);
      window.requestAnimationFrame(() => setToastOpen(true));

      toastTimerRef.current = window.setTimeout(() => {
        setToastOpen(false);
      }, args.durationMs ?? 4000);
    };
  }, []);

  useEffect(() => {
    if (state.status === "success") {
      const submittedOriginal = lastSubmittedNormalizedRef.current;
      setLastOriginalUrl(submittedOriginal);
      const newItem: ShortenHistoryItem = {
        id: state.id,
        shortPath: `/${state.id}`,
        originalUrl: submittedOriginal,
        createdAt: Date.now(),
      };

      setHistory((prev) => {
        const next = [newItem, ...prev.filter((item) => item.id !== newItem.id)]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, MAX_HISTORY_ITEMS);
        saveShortenHistory(next);
        return next;
      });

      setSuccessOpen(true);
      setSubmitted(false);
      setTouched(false);
      setUrl("");
    }

    if (state.status === "error") {
      showToast({
        variant: "destructive",
        title: t("toast.errorTitle"),
        message: state.message,
        durationMs: 4500,
      });
    }
  }, [showToast, state, t]);

  return (
    <form
      action={formAction}
      noValidate
      className="grid gap-3"
      onSubmit={(e) => {
        setSubmitted(true);
        if (errorMessage) {
          e.preventDefault();
          showToast({
            variant: "destructive",
            title: t("toast.inputErrorTitle"),
            message: errorMessage,
            durationMs: 4500,
          });
          return;
        }

        lastSubmittedNormalizedRef.current = normalized ?? "";
      }}
    >
      <div className="grid gap-2">
        <label htmlFor="url" className="text-foreground text-sm font-semibold">
          {t("form.labelUrl")}
        </label>
        <input
          id="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder={t("form.placeholderUrl")}
          value={url}
          aria-describedby={errorId}
          className={cn(
            "border-input bg-background text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-ring h-12 w-full rounded-2xl border px-4 text-base shadow-sm focus-visible:ring-2 focus-visible:outline-none",
            showError && "border-destructive focus-visible:ring-destructive"
          )}
          onChange={(e) => setUrl(e.currentTarget.value)}
          onBlur={() => setTouched(true)}
        />

        <input type="hidden" name="url" value={normalized ?? ""} />

        <p
          id={errorId}
          aria-live="polite"
          className={cn(
            "min-h-5 text-xs leading-5 font-medium",
            showError ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {showError ? errorMessage : " "}
        </p>
      </div>

      <div className="pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-base font-semibold shadow-sm transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
        >
          {isPending ? t("form.submitting") : t("form.submit")}
        </button>
      </div>

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="border-primary/20 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-xl text-[#f86b7c]">
              {t("dialog.successTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("dialog.successDescription")}
            </DialogDescription>
          </DialogHeader>

          {shortUrl ? (
            <div className="grid gap-2">
              <label
                htmlFor="short-url-result"
                className="text-foreground/80 text-sm font-medium"
              >
                {t("dialog.shortUrlLabel")}
              </label>
              <div className="relative">
                <input
                  id="short-url-result"
                  readOnly
                  value={shortUrlForUi ?? ""}
                  className="border-input bg-background text-foreground focus-visible:ring-ring h-11 w-full rounded-xl border py-2 pr-12 pl-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="absolute top-1/2 right-2 -translate-y-1/2">
                  <CopyButton
                    value={shortUrlForUi ?? ""}
                    onCopied={() =>
                      showToast({
                        variant: "default",
                        title: t("toast.copiedTitle"),
                        message: t("toast.copiedMessage"),
                        durationMs: 2500,
                      })
                    }
                    className="hover:bg-secondary focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex flex-row justify-end gap-2">
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={shortPath ?? "#"}
              className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
            >
              {t("dialog.open")}
            </a>
            <button
              type="button"
              className="border-border bg-card text-foreground hover:bg-secondary focus-visible:ring-ring inline-flex h-10 items-center justify-center rounded-full border px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => setSuccessOpen(false)}
            >
              {t("dialog.close")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toastVisible ? (
        <div
          className={cn(
            "fixed right-4 bottom-4 z-60 w-[min(420px,calc(100vw-2rem))] transition duration-150 ease-out",
            toastOpen
              ? "translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-2 scale-[0.98] opacity-0"
          )}
          onTransitionEnd={(e) => {
            if (e.currentTarget !== e.target) return;
            if (!toastOpen) setToastVisible(false);
          }}
        >
          {toastVariant === "destructive" ? (
            <div
              role="alert"
              className={cn(
                "bg-card text-card-foreground border-border/60 relative rounded-xl border px-4 py-3 shadow-lg",
                "border-destructive"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="text-destructive mt-0.5 shrink-0" aria-hidden>
                  <MdErrorOutline className="size-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-left text-sm leading-5 font-semibold">
                    {toastTitle}
                  </p>
                  {toastMessage ? (
                    <p className="text-muted-foreground mt-1 text-left text-sm leading-5 wrap-break-word whitespace-pre-wrap">
                      {toastMessage}
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  aria-label={t("toast.close")}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
                  onClick={() => setToastOpen(false)}
                >
                  <MdClose className="size-5" aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <div
              role="status"
              className={cn(
                "bg-card text-card-foreground border-border/60 relative rounded-xl border px-4 py-3 shadow-lg",
                "border-primary"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="text-primary mt-0.5 shrink-0" aria-hidden>
                  <MdCheckCircle className="size-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-left text-sm leading-5 font-semibold">
                    {toastTitle}
                  </p>
                  {toastMessage ? (
                    <p className="text-muted-foreground mt-1 text-left text-sm leading-5 wrap-break-word whitespace-pre-wrap">
                      {toastMessage}
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  aria-label={t("toast.close")}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
                  onClick={() => setToastOpen(false)}
                >
                  <MdClose className="size-5" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <div className="border-border/60 mt-6 grid gap-2 border-t pt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-foreground text-sm font-semibold">
            {t("history.title")}
          </h2>

          {history.length > 0 ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center justify-center rounded-md px-2 py-1 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => setClearAllConfirmOpen(true)}
            >
              {t("history.clearAll")}
            </button>
          ) : null}
        </div>

        {history.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("history.empty")}</p>
        ) : (
          <ul className="grid gap-2">
            {history.map((item) => (
              <li
                key={`${item.id}:${item.createdAt}`}
                className="border-border/60 bg-secondary/30 relative overflow-visible rounded-2xl border px-4 py-3"
              >
                <button
                  type="button"
                  aria-label={t("history.deleteAria")}
                  className="border-destructive/10 text-destructive/80 focus-visible:ring-ring absolute -top-2 -right-2 inline-flex size-7 items-center justify-center rounded-full border bg-red-50 shadow-sm transition focus-visible:ring-2 focus-visible:outline-none"
                  onClick={() => {
                    setHistory((prev) => {
                      const next = prev.filter((x) => x.id !== item.id);
                      saveShortenHistory(next);
                      return next;
                    });
                    showToast({
                      variant: "default",
                      title: t("history.deletedToastTitle"),
                      durationMs: 2200,
                    });
                  }}
                >
                  <MdClose className="size-4" aria-hidden />
                </button>

                <div className="grid gap-y-1">
                  <div className="flex items-center gap-0">
                    <a
                      href={
                        requestOrigin
                          ? `${requestOrigin}${item.shortPath}`
                          : item.shortPath
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground min-w-0 flex-1 text-sm leading-5 font-semibold break-all underline underline-offset-2"
                    >
                      {requestOrigin
                        ? `${requestOrigin}${item.shortPath}`
                        : item.shortPath}
                    </a>

                    <CopyButton
                      value={
                        requestOrigin
                          ? `${requestOrigin}${item.shortPath}`
                          : item.shortPath
                      }
                      onCopied={() =>
                        showToast({
                          variant: "default",
                          title: t("toast.copiedTitle"),
                          message: t("toast.copiedMessage"),
                          durationMs: 2500,
                        })
                      }
                      className="hover:bg-secondary focus-visible:ring-ring shrink-0"
                    />
                  </div>

                  {item.originalUrl ? (
                    <div className="grid">
                      <p className="text-foreground/70 text-xs font-medium">
                        {t("history.destinationLabel")}
                      </p>
                      <a
                        href={item.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground block text-sm break-all underline underline-offset-2"
                      >
                        {item.originalUrl}
                      </a>
                    </div>
                  ) : null}

                  <span className="text-muted-foreground text-right text-xs tabular-nums">
                    {new Date(item.createdAt).toLocaleString("ja-JP")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={clearAllConfirmOpen} onOpenChange={setClearAllConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("history.clearAllConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("history.clearAllConfirmDescription")}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex flex-row justify-end gap-2">
            <button
              type="button"
              className="border-border bg-card text-foreground hover:bg-secondary focus-visible:ring-ring inline-flex h-10 items-center justify-center rounded-full border px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => setClearAllConfirmOpen(false)}
            >
              {t("history.cancel")}
            </button>
            <button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => {
                setHistory([]);
                saveShortenHistory([]);
                setClearAllConfirmOpen(false);
                showToast({
                  variant: "default",
                  title: t("history.clearedToastTitle"),
                  durationMs: 2500,
                });
              }}
            >
              {t("history.confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
