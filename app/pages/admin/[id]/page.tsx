/* eslint-disable import/no-default-export */

import Link from "next/link";
import { listAdminAccessLogs } from "../_actions/admin";
import { ClientDateTime } from "../_components/client-datetime";

export default async function AdminAccessLogsPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const res = await listAdminAccessLogs(id, { limit: 100 });
  const logs = res.items;

  return (
    <div className="bg-background text-foreground min-h-screen">
      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <header className="mb-8">
          <div className="border-border bg-secondary text-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold">
            <span className="bg-primary inline-block size-2 rounded-full" />
            Admin
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-pretty sm:text-4xl">
            アクセスログ
          </h1>
          <p className="text-muted-foreground mt-2 text-sm break-all">
            ID: <span className="font-mono">{id}</span>（直近100件）
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Link
              href="/pages/admin"
              className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2"
            >
              戻る
            </Link>
            <Link
              href={`/${encodeURIComponent(id)}`}
              className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2"
            >
              open
            </Link>
          </div>
        </header>

        <main className="grid gap-5">
          <section className="border-border bg-card rounded-3xl border p-5 shadow-sm sm:p-6">
            {logs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                アクセスログがありません。
              </p>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-border border-b text-left">
                      <th className="px-3 py-2 font-semibold">Accessed</th>
                      <th className="px-3 py-2 font-semibold">IP</th>
                      <th className="px-3 py-2 font-semibold">User-Agent</th>
                      <th className="px-3 py-2 font-semibold">Request ID</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr
                        key={`${l.ts}-${l.request_id ?? ""}`}
                        className="border-border border-b align-top"
                      >
                        <td className="px-3 py-2">
                          <div className="text-muted-foreground text-xs">
                            <ClientDateTime value={l.ts} />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-muted-foreground font-mono text-xs">
                            {l.ip || "-"}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-muted-foreground text-xs break-all">
                            {l.user_agent || "-"}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-muted-foreground font-mono text-xs break-all">
                            {l.request_id || "-"}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="bg-secondary text-foreground border-border inline-flex rounded-full border px-2 py-0.5 text-xs">
                            {l.status_code}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
