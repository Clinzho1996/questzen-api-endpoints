import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
	apiVersion: "2023-10-16",
});

export async function POST(request: NextRequest) {
	try {
		const { userId, plan } = await request.json();

		const priceId =
			plan === "monthly"
				? process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID
				: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID;

		if (!priceId) {
			return NextResponse.json(
				{ error: "Price not configured" },
				{ status: 500 }
			);
		}

		// Create Checkout Session[citation:4][citation:6]
		const session = await stripe.checkout.sessions.create({
			payment_method_types: ["card"],
			line_items: [
				{
					price: priceId,
					quantity: 1,
				},
			],
			mode: "subscription",
			success_url: `${request.headers.get(
				"origin"
			)}/profile?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${request.headers.get("origin")}/upgrade`,
			client_reference_id: userId, // Store your user ID for webhook handling
			metadata: {
				userId: userId,
				planType: plan,
			},
		});

		return NextResponse.json({ sessionId: session.id });
	} catch (error: any) {
		console.error("Checkout error:", error);
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}
