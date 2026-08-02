'use client'

import dynamic from 'next/dynamic'

const PvZGame = dynamic(() => import('@/components/game/PvZGame'), { ssr: false })

export default function Home() {
  return <PvZGame />
}
 // force
