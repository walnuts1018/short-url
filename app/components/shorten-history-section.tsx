"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { MdClose } from "react-icons/md";

import { CopyButton } from "./copy-button";
import {
  clearShortenHistory,
  isShortenHistoryStorageKey,
  loadShortenHistory,
  removeShortenHistoryItem,
  SHORTEN_HISTORY_UPDATED_EVENT,
  type ShortenHistoryItem,
} from "./shorten-history-store";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ShortenHistorySection({
  requestOrigin,
  showToast,
}: {
  requestOrigin?: string;
  showToast: (args: {
    variant: "default" | "destructive";
    title: string;
    message?: string;
    durationMs?: number;
  }) => void;
}) {
  const { t } = useTranslation();
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [history, setHistory] = useState<ShortenHistoryItem[] | null>(null);

  useEffect(() => {
    const reload = () => setHistory(loadShortenHistory());
    const onStorage = (e: StorageEvent) => {
      if (isShortenHistoryStorageKey(e.key)) reload();
    };

    reload();

    window.addEventListener(SHORTEN_HISTORY_UPDATED_EVENT, reload);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(SHORTEN_HISTORY_UPDATED_EVENT, reload);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  if (history === null) {
    return (
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
  }

  return (
    <>
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
          {history.map((item) => {
            const urlToShow = requestOrigin
              ? `${requestOrigin}${item.shortPath}`
              : item.shortPath;

            return (
              <li
                key={`${item.id}:${item.createdAt}`}
                className="border-border/60 bg-secondary/30 relative overflow-visible rounded-2xl border px-4 py-3"
              >
                <button
                  type="button"
                  aria-label={t("history.deleteAria")}
                  className="border-destructive/10 text-destructive/80 focus-visible:ring-ring absolute -top-2 -right-2 inline-flex size-7 items-center justify-center rounded-full border bg-red-50 shadow-sm transition focus-visible:ring-2 focus-visible:outline-none"
                  onClick={() => {
                    removeShortenHistoryItem(item.id);
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
                      href={urlToShow}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground min-w-0 flex-1 text-sm leading-5 font-semibold break-all underline underline-offset-2"
                    >
                      {urlToShow}
                    </a>

                    <CopyButton
                      value={urlToShow}
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
            );
          })}
        </ul>
      )}

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
                clearShortenHistory();
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
    </>
  );
}
