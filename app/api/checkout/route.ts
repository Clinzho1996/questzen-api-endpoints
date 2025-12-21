// app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
	apiVersion: "2023-10-16",
});

export async function POST(request: NextRequest) {
	try {
		const { userId, plan } = await request.json();
		console.log("Creating checkout for:", { userId, plan });

		const priceId =
			plan === "monthly"
				? process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID
				: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID;

		if (!priceId) {
			console.error("Price ID not found for plan:", plan);
			return NextResponse.json(
				{ error: `Price not configured for ${plan} plan` },
				{ status: 500 }
			);
		}

		// Create checkout session
		const session = await stripe.checkout.sessions.create({
			payment_method_types: ["card"],
			line_items: [{ price: priceId, quantity: 1 }],
			mode: "subscription",
			success_url: `${process.env.FRONTEND_URL}/profile?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${process.env.FRONTEND_URL}/upgrade`,
			metadata: {
				userId: userId,
				planType: plan,
			},
			subscription_data: {
				metadata: {
					userId: userId,
					planType: plan,
				},
			},
		});

		console.log("Stripe session created:", {
			id: session.id,
			url: session.url,
		});

		return NextResponse.json({
			sessionId: session.id,
			url: session.url,
		});
	} catch (error: any) {
		console.error("Checkout error:", error);
		return NextResponse.json(
			{ error: error.message || "Failed to create checkout session" },
			{ status: 500 }
		);
	}
}
