/* eslint-disable import/no-default-export */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "利用規約",
};

export default function TermsPage() {
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
            利用規約
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            最終更新日：2025年12月15日
          </p>
        </header>

        <main className="grid gap-5">
          <section className="border-border bg-card rounded-3xl border p-5 shadow-sm sm:p-6">
            <div className="grid gap-6 text-sm leading-7">
              <p>
                この利用規約（以下「本規約」）は、waln.uk（以下「本サービス」）の利用条件を定めるものです。
                利用者は、本サービスを利用した時点で本規約に同意したものとみなします。
              </p>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">1. 適用</h2>
                <p>
                  本規約は、本サービスの利用に関する運営者と利用者との間の一切の関係に適用されます。
                </p>
              </div>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">2. サービス内容</h2>
                <ul className="list-disc pl-5">
                  <li>
                    本サービスは、利用者が指定したURLを短縮し、短縮URLを発行する機能を提供します。
                  </li>
                  <li>
                    本サービスの利用にあたり、入力されたURLは短縮URL発行のためにサーバへ送信されます。
                  </li>
                  <li>
                    「作成履歴」は、お使いのブラウザ内（localStorage）に保存されます。端末やブラウザを変更した場合、履歴は引き継がれません。
                  </li>
                </ul>
              </div>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">3. 禁止事項</h2>
                <p>
                  利用者は、本サービスの利用にあたり、以下の行為をしてはなりません。
                </p>
                <ul className="list-disc pl-5">
                  <li>法令または公序良俗に違反する行為</li>
                  <li>犯罪行為に関連する行為、またはその助長</li>
                  <li>フィッシング、マルウェア配布、詐欺等の不正行為</li>
                  <li>
                    第三者の権利（著作権、商標権、プライバシー等）を侵害する行為
                  </li>
                  <li>
                    本サービスまたは第三者のサーバ・ネットワークに過度な負荷をかける行為
                  </li>
                  <li>
                    本サービスの運営を妨害する行為、または妨害するおそれのある行為
                  </li>
                  <li>不正アクセス、またはこれを試みる行為</li>
                  <li>
                    本サービスの脆弱性探索、リバースエンジニアリング等の不正な調査行為
                  </li>
                  <li>その他、運営者が不適切と判断する行為</li>
                </ul>
              </div>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">4. 提供の停止・変更</h2>
                <p>
                  運営者は、利用者に事前に通知することなく、本サービスの全部または一部の提供を停止・中断・変更することがあります。
                </p>
              </div>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">5. 免責</h2>
                <ul className="list-disc pl-5">
                  <li>
                    運営者は、本サービスの正確性、完全性、有用性、特定目的適合性等について、いかなる保証も行いません。
                  </li>
                  <li>
                    短縮URLの到達性は、リンク先の状態や通信環境等により影響を受ける場合があります。
                  </li>
                  <li>
                    本サービスの利用により利用者に生じた損害について、運営者は運営者の故意または重大な過失がある場合を除き責任を負いません。
                  </li>
                </ul>
              </div>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">6. 規約の変更</h2>
                <p>
                  運営者は、必要と判断した場合、利用者に通知することなく本規約を変更できるものとします。
                  変更後の本規約は、本サービス上に表示した時点から効力を生じます。
                </p>
              </div>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">7. 準拠法・裁判管轄</h2>
                <p>
                  本規約の解釈にあたっては日本法を準拠法とします。
                  本サービスに関して紛争が生じた場合、運営者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
                </p>
              </div>

              <div className="grid gap-2">
                <h2 className="text-base font-semibold">8. お問い合わせ</h2>
                <p>
                  本サービスに関するお問い合わせは、運営者のWebサイト（
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
