import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/paystack';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import Stripe from 'stripe';
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({
      error: {
        message: 'Missing stripe-signature header'
      }
    }, {
      status: 400
    });
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({
      error: {
        message: 'Webhook signature verification failed'
      }
    }, {
      status: 400
    });
  }
  const db = await getDatabase();
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId;
          if (userId) {
            await db.collection('users').updateOne({
              _id: new ObjectId(userId)
            }, {
              $set: {
                subscriptionTier: 'premium',
                stripeSubscriptionId: session.subscription as string,
                updatedAt: new Date()
              }
            });
          }
          break;
        }
      case 'customer.subscription.updated':
        {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;
          const user = await db.collection('users').findOne({
            stripeCustomerId: customerId
          });
          if (user) {
            const tier = subscription.status === 'active' ? 'premium' : 'free';
            await db.collection('users').updateOne({
              _id: user._id
            }, {
              $set: {
                subscriptionTier: tier,
                updatedAt: new Date()
              }
            });
          }
          break;
        }
      case 'customer.subscription.deleted':
        {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;
          const user = await db.collection('users').findOne({
            stripeCustomerId: customerId
          });
          if (user) {
            await db.collection('users').updateOne({
              _id: user._id
            }, {
              $set: {
                subscriptionTier: 'free',
                stripeSubscriptionId: null,
                updatedAt: new Date()
              }
            });
          }
          break;
        }
    }
    return NextResponse.json({
      received: true
    });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({
      error: {
        message: 'Webhook handler failed'
      }
    }, {
      status: 500
    });
  }
}