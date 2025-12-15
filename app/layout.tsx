import type { Metadata } from "next";
import { Nunito, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const defaultTitle = "短縮URL waln.uk";
const defaultDescription = "waln.ukは、シンプルで使いやすいURL短縮サービスです。";
const url = "https://waln.uk";

const NunitoFont = Nunito({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-Nunito",
});

const NotoFont = Noto_Sans_JP({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-Noto",
});

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: {
    default: defaultTitle,
    template: `%s | waln.uk`,
  },
  description: defaultDescription,
  authors: [
    {
      name: "Walnuts (@walnuts1018)",
      url: new URL("https://walnuts.dev"),
    },
    {
      name: "Walnuts (id:walnuts1018)",
      url: new URL("http://www.hatena.ne.jp/walnuts1018/"),
    },
  ],
  icons: [],
  openGraph: {
    title: defaultTitle,
    description: defaultDescription,
    url: new URL(url),
    siteName: defaultTitle,
    locale: "ja_JP",
    type: "website",
    images: "/opengraph-image.jpg",
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    site: "@walnuts1018",
    creator: "@walnuts1018",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link rel="manifest" href="/favicons/site.webmanifest" />
        <link rel="mask-icon" href="/favicons/safari-pinned-tab.svg" color="#5bbad5" />
        <meta name="msapplication-TileColor" content="#FF9F21" />
        <meta name="theme-color" content="#FF9F21" />
        <meta name="twitter:image" content="https://waln.uk/opengraph-image.jpg" />
      </head>
      <body className={`${NunitoFont.variable} ${NotoFont.variable}`}>{children}</body>
    </html>
  );
}
