'use client'
import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getZone } from '../../../lib/concentric/data'

export default function ZoneRedirectPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  useEffect(() => {
    getZone(id).then(z => {
      if (z?.markets?.id) router.replace(`/growth/markets/${z.markets.id}`)
      else router.replace('/growth')
    }).catch(() => router.replace('/growth'))
  }, [id, router])
  return null
}
