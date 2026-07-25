import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1c1e" },
  ],
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
