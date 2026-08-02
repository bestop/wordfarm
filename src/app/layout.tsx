import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WordFarm 🌸 单词庄园 · 萌系背单词游戏",
  description: "使用柔和马卡龙配色的萌系背单词塔防小游戏，边守护庄园边快乐学习英语词汇！适合全年龄段的温暖、可亲近、充满趣味的英语学习体验。",
  keywords: ["WordFarm", "单词庄园", "背单词", "英语学习", "Tower Defense", "塔防游戏", "Macaron", "Kawaii", "马卡龙色系", "萌系", "教育游戏"],
  authors: [{ name: "WordFarm Team" }],
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "WordFarm 🌸 单词庄园 · 萌系背单词塔防",
    description: "温暖马卡龙配色、可爱萌系画风的背单词小游戏，守护你的单词庄园吧！",
    url: "https://wordfarm.example.com",
    siteName: "WordFarm",
    type: "website",
    images: [{ url: "/logo.svg", width: 128, height: 128, alt: "WordFarm Kawaii Logo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "WordFarm 🌸 单词庄园 · 萌系背单词塔防",
    description: "温暖马卡龙配色、可爱萌系画风的背单词小游戏",
    images: ["/logo.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
