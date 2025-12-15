"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { MdCheck, MdClose, MdContentCopy } from "react-icons/md";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  onCopied,
  className,
}: {
  value: string;
  onCopied?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const copiedTimerRef = useRef<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label={t("copy.ariaLabel")}
        title={t("copy.ariaLabel")}
        className={cn(
          "text-foreground hover:bg-secondary focus-visible:ring-ring inline-flex size-9 items-center justify-center rounded-lg transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60",
          className
        )}
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              if (copiedTimerRef.current) {
                window.clearTimeout(copiedTimerRef.current);
              }
              copiedTimerRef.current = window.setTimeout(() => {
                setCopied(false);
              }, 1200);
              onCopied?.();
            } catch {
              setErrorOpen(true);
            }
          });
        }}
      >
        {copied ? (
          <MdCheck className="size-5" aria-hidden />
        ) : (
          <MdContentCopy className="size-5" aria-hidden />
        )}
      </button>

      <Dialog open={errorOpen} onOpenChange={setErrorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("copy.failedTitle")}</DialogTitle>
            <DialogDescription>{t("copy.failedDescription")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <label
              htmlFor="short-url"
              className="text-foreground/80 text-sm font-medium"
            >
              {t("dialog.shortUrlLabel")}
            </label>
            <input
              id="short-url"
              readOnly
              value={value}
              className="border-input bg-background text-foreground focus-visible:ring-ring h-11 w-full rounded-xl border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>

          <DialogFooter>
            <button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => setErrorOpen(false)}
            >
              <MdClose className="mr-2 size-4" aria-hidden />
              {t("dialog.close")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
