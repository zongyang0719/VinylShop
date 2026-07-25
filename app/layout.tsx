import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "唱片库",
  description: "浏览、整理并沉浸式翻看自己的唱片收藏。",
  openGraph: {
    title: "唱片库",
    description: "浏览、整理并沉浸式翻看自己的唱片收藏。",
    images: ["/og-cover.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "唱片库",
    description: "浏览、整理并沉浸式翻看自己的唱片收藏。",
    images: ["/og-cover.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
