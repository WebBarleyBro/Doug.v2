'use client'
import { createContext, useContext } from 'react'

// ── Toast ─────────────────────────────────────────────────────────────────────
export type ToastType = 'success' | 'error'
export type Toast = { id: number; message: string; type: ToastType }
export const ToastCtx = createContext<{ show: (m: string, t?: ToastType) => void }>({ show: () => {} })
export const useV3Toast = () => useContext(ToastCtx)

// ── Log visit ─────────────────────────────────────────────────────────────────
export const LogVisitCtx = createContext<{ open: (account?: { id: string; name: string }) => void }>({ open: () => {} })
export const useOpenLogVisit = () => useContext(LogVisitCtx)

// ── Win moment ────────────────────────────────────────────────────────────────
export type WinMoment = { product: string; account: string; title?: string }
export const WinMomentCtx = createContext<{ trigger: (d: WinMoment) => void }>({ trigger: () => {} })
export const useWinMoment = () => useContext(WinMomentCtx)
