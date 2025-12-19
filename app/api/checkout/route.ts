import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
	apiVersion: "2023-10-16", // Updated API version
});

// Add CORS headers function
function setCORSHeaders(response: NextResponse) {
	response.headers.set("Access-Control-Allow-Origin", "http://localhost:5173");
	response.headers.set(
		"Access-Control-Allow-Methods",
		"GET, POST, OPTIONS, PUT, DELETE"
	);
	response.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization"
	);
	response.headers.set("Access-Control-Allow-Credentials", "true");
	return response;
}

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
			const response = NextResponse.json(
				{ error: `Price not configured for ${plan} plan` },
				{ status: 500 }
			);
			return setCORSHeaders(response);
		}

		console.log("Using price ID:", priceId);

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ["card"],
			line_items: [{ price: priceId, quantity: 1 }],
			mode: "subscription",
			success_url: `${
				request.headers.get("origin") || "http://localhost:5173"
			}/profile?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${
				request.headers.get("origin") || "http://localhost:5173"
			}/upgrade`,
			client_reference_id: userId,
			metadata: { userId: userId, planType: plan },
			customer_creation: "always", // Important for subscriptions
		});

		console.log("Stripe session created:", {
			id: session.id,
			url: session.url,
			customer: session.customer,
		});

		// ⚡ CRITICAL FIX: Return BOTH sessionId AND url
		const response = NextResponse.json({
			sessionId: session.id,
			url: session.url, // This is what you're missing!
			customerId: session.customer,
		});

		return setCORSHeaders(response);
	} catch (error: any) {
		console.error("Checkout error:", error);
		const response = NextResponse.json(
			{ error: error.message || "Failed to create checkout session" },
			{ status: 500 }
		);
		return setCORSHeaders(response);
	}
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request: NextRequest) {
	const response = new NextResponse(null, { status: 200 });
	return setCORSHeaders(response);
}
