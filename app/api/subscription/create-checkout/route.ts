import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { stripe, PRICE_IDS } from '@/lib/stripe';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const {
      plan
    } = body; // 'monthly' or 'yearly'

    if (!plan || !['monthly', 'yearly'].includes(plan)) {
      return NextResponse.json({
        error: {
          message: 'Invalid plan'
        }
      }, {
        status: 400
      });
    }
    const db = await getDatabase();
    const userData = await db.collection('users').findOne({
      _id: new ObjectId(user.userId)
    });
    if (!userData) {
      return NextResponse.json({
        error: {
          message: 'User not found'
        }
      }, {
        status: 404
      });
    }

    // Get or create Stripe customer
    let customerId = userData.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.email,
        metadata: {
          userId: user.userId
        }
      });
      customerId = customer.id;
      await db.collection('users').updateOne({
        _id: new ObjectId(user.userId)
      }, {
        $set: {
          stripeCustomerId: customerId
        }
      });
    }

    // Create checkout session
    const priceId = plan === 'monthly' ? PRICE_IDS.premium_monthly : PRICE_IDS.premium_yearly;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/upgrade?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/upgrade?canceled=true`,
      metadata: {
        userId: user.userId
      }
    });
    return NextResponse.json({
      sessionId: session.id,
      url: session.url
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({
        error: {
          message: 'Unauthorized'
        }
      }, {
        status: 401
      });
    }
    console.error('Create checkout error:', error);
    return NextResponse.json({
      error: {
        message: 'Server error'
      }
    }, {
      status: 500
    });
  }
}