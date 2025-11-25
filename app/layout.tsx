import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Re:Card ヴァロラント自己紹介カードメーカー",
  description: "ヴァロラントのランク・エージェント・活動時間などを書いた自己紹介カードをブラウザで簡単に作れるツール",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "VALORANT Re:Card",
    description: "ヴァロラントのランク・エージェント・活動時間などを書いた自己紹介カードをブラウザで簡単に作れるツール",
    url: "https://re-card.nakano6.com",
    siteName: "VALORANT Re:Card",
    images: [
      {
        url: "/ogp.png",
        width: 1200,
        height: 630,
        alt: "VALORANT Re:Card プレビュー",
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VALORANT Re:Card",
    description: "ヴァロラントのランク・エージェント・活動時間などを書いた自己紹介カードをブラウザで簡単に作れるツール",
    images: ["/ogp.png"],
    creator: "@your_twitter_id",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
