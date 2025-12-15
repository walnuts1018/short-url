"use client";

import Image from "next/image";

import {
  useActionState,
  useEffect,
  useId,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import { useTranslation } from "react-i18next";

import { FaLine, FaXTwitter } from "react-icons/fa6";
import { MdCheckCircle, MdClose, MdErrorOutline } from "react-icons/md";

import { shortenAction, type ShortenActionState } from "../_actions/shorten";
import { CopyButton } from "./copy-button";
import HatenaBookmarkIcon from "./hatenabookmark_symbolmark.png";
import { addShortenHistoryItem } from "./shorten-history-store";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const SHORTEN_CREATE_COUNT_STORAGE_KEY_V1 = "short-url:create-count:v1";

const ShortenHistorySection = lazy(async () => ({
  default: (await import("./shorten-history-section")).ShortenHistorySection,
}));

function bumpCreateCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(
      SHORTEN_CREATE_COUNT_STORAGE_KEY_V1
    );
    const current = raw ? Number.parseInt(raw, 10) : 0;
    const safeCurrent = Number.isFinite(current) && current >= 0 ? current : 0;
    const next = safeCurrent + 1;
    window.localStorage.setItem(
      SHORTEN_CREATE_COUNT_STORAGE_KEY_V1,
      String(next)
    );
    return next;
  } catch {
    return 0;
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
  const [sharePromptOpen, setSharePromptOpen] = useState(false);
  const [shouldPromptShareAfterClose, setShouldPromptShareAfterClose] =
    useState(false);

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

      const createCount = bumpCreateCount();
      setShouldPromptShareAfterClose(
        createCount === 3 || (createCount > 0 && createCount % 10 === 0)
      );

      addShortenHistoryItem({
        id: state.id,
        shortPath: `/${state.id}`,
        originalUrl: submittedOriginal,
        createdAt: Date.now(),
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
  }, [requestOrigin, showToast, state, t]);

  const shareText = t("share.shareText");

  const shareToX = (urlToShare: string) => {
    const intent = new URL("https://x.com/intent/tweet");
    intent.searchParams.set("url", urlToShare);
    intent.searchParams.set("text", shareText);
    window.open(intent.toString(), "_blank", "noopener,noreferrer");
  };

  const shareToHatebu = (urlToShare: string) => {
    const intent = new URL("https://b.hatena.ne.jp/add");
    intent.searchParams.set("mode", "confirm");
    intent.searchParams.set("url", urlToShare);
    intent.searchParams.set("title", shareText);
    window.open(intent.toString(), "_blank", "noopener,noreferrer");
  };

  const shareToLine = (urlToShare: string) => {
    const intent = new URL("https://social-plugins.line.me/lineit/share");
    intent.searchParams.set("url", urlToShare);
    window.open(intent.toString(), "_blank", "noopener,noreferrer");
  };

  const siteUrlForShare = useMemo(() => {
    if (requestOrigin) return requestOrigin;
    if (typeof window !== "undefined") return String(window.location.origin);
    return "";
  }, [requestOrigin]);

  const historyFallback = (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-foreground text-sm font-semibold">
          {t("history.title")}
        </h2>
      </div>
      <ul className="grid gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={i}
            className="border-border/60 bg-secondary/30 animate-pulse rounded-2xl border px-4 py-3"
          >
            <div className="grid gap-2">
              <div className="bg-muted h-4 w-4/5 rounded" />
              <div className="bg-muted h-4 w-2/3 rounded" />
              <div className="bg-muted ml-auto h-3 w-28 rounded" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );

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

      <Dialog
        open={successOpen}
        onOpenChange={(open) => {
          if (!open && successOpen && shouldPromptShareAfterClose) {
            setShouldPromptShareAfterClose(false);
            setSharePromptOpen(true);
          }
          setSuccessOpen(open);
        }}
      >
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
              onClick={() => {
                if (shouldPromptShareAfterClose) {
                  setShouldPromptShareAfterClose(false);
                  setSharePromptOpen(true);
                }
                setSuccessOpen(false);
              }}
            >
              {t("dialog.close")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sharePromptOpen} onOpenChange={setSharePromptOpen}>
        <DialogContent className="border-primary/20 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-xl text-[#f86b7c]">
              {t("share.promptTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("share.promptDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                aria-label={t("share.x")}
                title={t("share.x")}
                className="border-border bg-card text-foreground hover:bg-secondary focus-visible:ring-ring inline-flex size-10 items-center justify-center rounded-full border transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
                onClick={() => void shareToX(siteUrlForShare)}
                disabled={!siteUrlForShare}
              >
                <FaXTwitter className="size-5" aria-hidden />
                <span className="sr-only">{t("share.x")}</span>
              </button>
              <button
                type="button"
                aria-label={t("share.line")}
                title={t("share.line")}
                className="border-border bg-card text-foreground hover:bg-secondary focus-visible:ring-ring inline-flex size-10 items-center justify-center rounded-full border transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
                onClick={() => void shareToLine(siteUrlForShare)}
                disabled={!siteUrlForShare}
              >
                <FaLine className="size-5" aria-hidden />
                <span className="sr-only">{t("share.line")}</span>
              </button>
              <button
                type="button"
                aria-label={t("share.hatebu")}
                title={t("share.hatebu")}
                className="border-border bg-card text-foreground hover:bg-secondary focus-visible:ring-ring inline-flex size-10 items-center justify-center rounded-full border transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
                onClick={() => void shareToHatebu(siteUrlForShare)}
                disabled={!siteUrlForShare}
              >
                <Image
                  src={HatenaBookmarkIcon}
                  alt="はてなブックマーク"
                  className="size-5"
                  height={16}
                  width={16}
                />{" "}
                <span className="sr-only">{t("share.hatebu")}</span>
              </button>
            </div>
          </div>

          <DialogFooter className="flex flex-row justify-end gap-2">
            <button
              type="button"
              className="border-border bg-card text-foreground hover:bg-secondary focus-visible:ring-ring inline-flex h-10 items-center justify-center rounded-full border px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => setSharePromptOpen(false)}
            >
              {t("share.notNow")}
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

      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        <p className="text-muted-foreground text-xs font-medium">
          {t("share.label")}
        </p>
        <button
          type="button"
          aria-label={t("share.x")}
          title={t("share.x")}
          className="border-border bg-card text-foreground hover:bg-secondary focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-full border transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
          onClick={() => void shareToX(siteUrlForShare)}
          disabled={!siteUrlForShare}
        >
          <FaXTwitter className="size-4" aria-hidden />
          <span className="sr-only">{t("share.x")}</span>
        </button>
        <button
          type="button"
          aria-label={t("share.line")}
          title={t("share.line")}
          className="border-border bg-card text-foreground hover:bg-secondary focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-full border transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
          onClick={() => void shareToLine(siteUrlForShare)}
          disabled={!siteUrlForShare}
        >
          <FaLine className="size-4" aria-hidden />
          <span className="sr-only">{t("share.line")}</span>
        </button>
        <button
          type="button"
          aria-label={t("share.hatebu")}
          title={t("share.hatebu")}
          className="border-border bg-card text-foreground hover:bg-secondary focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-full border transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
          onClick={() => void shareToHatebu(siteUrlForShare)}
          disabled={!siteUrlForShare}
        >
          <Image
            src={HatenaBookmarkIcon}
            alt="はてなブックマーク"
            className="size-4"
            height={16}
            width={16}
          />
          <span className="sr-only">{t("share.hatebu")}</span>
        </button>
      </div>

      <div className="border-border/60 mt-6 grid gap-2 border-t pt-4">
        <Suspense fallback={historyFallback}>
          <ShortenHistorySection
            requestOrigin={requestOrigin}
            showToast={showToast}
          />
        </Suspense>
      </div>
    </form>
  );
}
