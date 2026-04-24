import Stripe from 'stripe'

// Lazy getter — instantiated at request time, not module load time
// This prevents build failures when STRIPE_SECRET_KEY isn't available at build
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-04-22.dahlia',
  })
}
