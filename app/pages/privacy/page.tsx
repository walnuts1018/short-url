/* eslint-disable import/no-default-export */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <div className="mx-auto max-w-2xl px-5 py-12 sm:px-8">
        <header className="mb-6">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm font-medium underline underline-offset-2"
          >
            戻る
          </Link>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
            プライバシーポリシー
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            最終更新日：2025年12月15日
          </p>
        </header>

        <main className="grid gap-5">
          <section className="border-border bg-card rounded-3xl border p-5 shadow-sm sm:p-6">
            <div className="grid gap-6 text-sm leading-7">
              <p>
                本プライバシーポリシーは、waln.uk（以下「本サービス」）における利用者の情報の取扱いについて定めるものです。
              </p>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">1. 取得する情報</h2>
                <p>本サービスは、以下の情報を取得することがあります。</p>
                <ul className="list-disc pl-5">
                  <li>利用者が短縮対象として入力したURL</li>
                  <li>
                    アクセスログ（IPアドレス、User-Agent、アクセス日時、ステータスコード、リクエスト識別子等）
                  </li>
                  <li>
                    ブラウザ内に保存される情報（例：「作成履歴」を localStorage
                    に保存）
                  </li>
                </ul>
              </div>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">2. 利用目的</h2>
                <ul className="list-disc pl-5">
                  <li>短縮URLの発行・リダイレクト等、本サービスの提供のため</li>
                  <li>不正利用の防止、セキュリティ対策のため</li>
                  <li>障害対応、運用監視、調査・分析および品質改善のため</li>
                </ul>
              </div>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">3. 保存期間</h2>
                <p>
                  アクセスログは、原則として30日間保存します。なお、法令遵守や不正対応等の必要がある場合、例外的に保管期間を変更することがあります。
                </p>
              </div>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">4. 第三者提供・委託</h2>
                <p>
                  本サービスは、法令に基づく場合を除き、利用者の情報を本人の同意なく第三者に提供しません。
                  ただし、本サービスの運用に必要な範囲で、インフラ事業者等へ取扱いを委託する場合があります。
                </p>
              </div>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">5. 安全管理</h2>
                <p>
                  取得した情報の漏えい、滅失または毀損の防止等のため、合理的な範囲で必要かつ適切な安全管理措置を講じます。
                </p>
              </div>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">6. 外部サービス</h2>
                <p>
                  本サービスは、ネットワーク上の経路やインフラ構成により、CDN等の外部サービスを経由する場合があります。
                  その場合、当該外部サービスの提供者が定めるポリシーが適用されることがあります。
                </p>
              </div>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">7. 本ポリシーの変更</h2>
                <p>
                  運営者は、必要に応じて本ポリシーを変更することがあります。変更後の内容は、本サービス上に表示した時点から効力を生じます。
                </p>
              </div>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">8. お問い合わせ</h2>
                <p>
                  本ポリシーに関するお問い合わせは、運営者のWebサイト（
                  <a
                    href="https://walnuts.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    https://walnuts.dev
                  </a>
                  ）をご確認ください。
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
