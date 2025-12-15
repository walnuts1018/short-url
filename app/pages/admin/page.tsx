/* eslint-disable import/no-default-export */

import Link from "next/link";
import {
  disableLinkAction,
  listAdminLinks,
  restoreLinkAction,
} from "./_actions/admin";

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default async function AdminPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  type SearchParams = Record<string, string | string[] | undefined>;
  const searchParams = await Promise.resolve(
    props.searchParams ?? ({} as SearchParams)
  );
  const rawPageState = searchParams.page_state;
  const pageState = typeof rawPageState === "string" ? rawPageState : null;

  const res = await listAdminLinks({ limit: 20, pageState });
  const links = res.items;
  const nextPageState = res.next_page_state;

  return (
    <div className="bg-background text-foreground min-h-screen">
      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <header className="mb-8">
          <div className="border-border bg-secondary text-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold">
            <span className="bg-primary inline-block size-2 rounded-full" />
            Admin
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-pretty sm:text-4xl">
            短縮リンク管理
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            作成日時の新しい順に表示します（ページングあり）。
          </p>
        </header>

        <main className="grid gap-5">
          <section className="border-border bg-card rounded-3xl border p-5 shadow-sm sm:p-6">
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-border border-b text-left">
                    <th className="px-3 py-2 font-semibold">ID</th>
                    <th className="px-3 py-2 font-semibold">Original</th>
                    <th className="px-3 py-2 font-semibold">Created</th>
                    <th className="px-3 py-2 font-semibold">Creator</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Last access</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((l) => {
                    const isEnabled = l.enabled;
                    const detailHref = `/pages/admin/${encodeURIComponent(l.id)}`;
                    return (
                      <tr
                        key={l.id}
                        className="border-border border-b align-top"
                      >
                        <td className="px-3 py-2 font-mono text-xs">
                          <div className="flex flex-col gap-1">
                            <Link
                              href={detailHref}
                              className="hover:text-foreground underline underline-offset-2"
                            >
                              {l.id}
                            </Link>
                            <Link
                              href={`/${l.id}`}
                              className="text-muted-foreground hover:text-foreground underline underline-offset-2"
                            >
                              open
                            </Link>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <a
                            href={l.original_url}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-foreground text-muted-foreground break-all underline underline-offset-2"
                          >
                            {l.original_url}
                          </a>
                        </td>
                        <td className="px-3 py-2">
                          <Link href={detailHref} className="block">
                            <div className="text-muted-foreground text-xs">
                              {formatDateTime(l.created_at)}
                            </div>
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <Link href={detailHref} className="block">
                            <div className="text-muted-foreground text-xs">
                              <div>{l.creator_ip || "-"}</div>
                              <div className="break-all">
                                {l.creator_user_agent || "-"}
                              </div>
                            </div>
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              isEnabled
                                ? "bg-secondary text-foreground border-border inline-flex rounded-full border px-2 py-0.5 text-xs"
                                : "bg-secondary text-foreground border-border inline-flex rounded-full border px-2 py-0.5 text-xs"
                            }
                          >
                            {isEnabled ? "enabled" : "disabled"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <Link href={detailHref} className="block">
                            <div className="text-muted-foreground text-xs">
                              {formatDateTime(l.last_access_at)}
                            </div>
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <form action={disableLinkAction}>
                              <input type="hidden" name="id" value={l.id} />
                              <button
                                type="submit"
                                className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-9 items-center justify-center rounded-full px-3 text-xs font-semibold transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
                                disabled={!isEnabled}
                              >
                                無効化
                              </button>
                            </form>
                            <form action={restoreLinkAction}>
                              <input type="hidden" name="id" value={l.id} />
                              <button
                                type="submit"
                                className="border-border bg-secondary text-foreground hover:bg-secondary/80 focus-visible:ring-ring inline-flex h-9 items-center justify-center rounded-full border px-3 text-xs font-semibold transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
                                disabled={isEnabled}
                              >
                                復元
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center gap-3">
              {pageState ? (
                <Link
                  href="/pages/admin"
                  className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2"
                >
                  先頭へ
                </Link>
              ) : null}
              {nextPageState ? (
                <Link
                  href={`/pages/admin?page_state=${encodeURIComponent(nextPageState)}`}
                  className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2"
                >
                  次へ
                </Link>
              ) : (
                <span className="text-muted-foreground text-sm">
                  これ以上ありません
                </span>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
