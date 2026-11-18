import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

export const metadata: Metadata = {
  title: '单词农场 · 萌系塔防背单词',
  description:
    '植物大战僵尸式塔防 × 小学英语背单词：答题积攒阳光，种植物消灭僵尸，守住农场篱笆门。4968 词题库：小学/初中/高中/KET/PET + 沪教/人教PEP/外研教材词库 34 档（版本→年级→上下册）+ 自定义词库。',
  applicationName: '单词农场',
  keywords: ['背单词', '塔防', '英语学习', '单词农场', '儿童教育', '沪教版', '人教版PEP', '外研版'],
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#F6B8C6',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
