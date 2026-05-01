'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function RedirectContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const market = searchParams.get('market')
  useEffect(() => {
    router.replace(market ? `/growth/markets/${market}` : '/growth')
  }, [router, market])
  return null
}

export default function NewZonePage() {
  return <Suspense><RedirectContent /></Suspense>
}
