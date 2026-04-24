import Stripe from 'stripe'

// Server-side only — never import this in client components
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})
