/* eslint-disable import/no-default-export */
import { headers } from "next/headers";
import Link from "next/link";
import { ShortenForm } from "./components/shorten-form";
import { getServerT } from "./i18n/server";

async function getRequestOriginFromHeaders(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";
  return `https://${host}`;
}

export default async function Home() {
  const t = await getServerT();
  const requestOrigin = await getRequestOriginFromHeaders();

  return (
    <div className="bg-background text-foreground min-h-screen">
      <div className="mx-auto max-w-2xl px-5 py-12 sm:px-8">
        <header className="mb-8">
          <div className="border-border bg-secondary text-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold">
            <span className="bg-primary inline-block size-2 rounded-full" />
            {t("app.brand")}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-pretty sm:text-4xl">
            {t("app.homeTitle")}
          </h1>
        </header>

        <main className="grid gap-5">
          <section className="border-border bg-card rounded-3xl border p-5 shadow-sm sm:p-6">
            <ShortenForm requestOrigin={requestOrigin} />
          </section>
        </main>

        <footer className="mt-8 text-center text-xs">
          <Link
            href="/pages/terms"
            className="text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            利用規約
          </Link>
        </footer>
      </div>
    </div>
  );
}
