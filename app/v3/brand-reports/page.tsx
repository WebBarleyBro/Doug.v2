'use client'
import BrandReports from '../../components/BrandReports'
import { v3 } from '../lib/theme'
import { useV3Toast } from '../lib/context'

export default function BrandReportsPage() {
  const { show } = useV3Toast()
  return <BrandReports palette={v3} toast={show} />
}
