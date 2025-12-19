import Stripe from 'stripe';
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Please add STRIPE_SECRET_KEY to .env');
}
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia'
});
export const PRICE_IDS = {
  premium_monthly: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || '',
  premium_yearly: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID || ''
};