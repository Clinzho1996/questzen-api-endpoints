// In your questzen-api-endpoints project (Vercel deployment)
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
	apiVersion: "2023-10-16",
});

// Add CORS headers function
function setCORSHeaders(response: NextResponse, origin: string | null) {
	// Allow both production and localhost origins
	const allowedOrigins = [
		"https://questzenai.devclinton.org",
		"http://localhost:5173",
		"http://localhost:3000",
	];

	const requestOrigin = origin || "";
	const isAllowedOrigin = allowedOrigins.includes(requestOrigin);

	if (isAllowedOrigin) {
		response.headers.set("Access-Control-Allow-Origin", requestOrigin);
	} else {
		// Default to production domain if origin not allowed
		response.headers.set(
			"Access-Control-Allow-Origin",
			"https://questzenai.devclinton.org"
		);
	}

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
		const origin = request.headers.get("origin");

		console.log("Creating checkout for:", { userId, plan, origin });

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
			return setCORSHeaders(response, origin);
		}

		// Create checkout session
		const session = await stripe.checkout.sessions.create({
			payment_method_types: ["card"],
			line_items: [{ price: priceId, quantity: 1 }],
			mode: "subscription",
			success_url: `${
				origin || "https://questzenai.devclinton.org"
			}/profile?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${origin || "https://questzenai.devclinton.org"}/upgrade`,
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

		const response = NextResponse.json({
			sessionId: session.id,
			url: session.url,
		});

		return setCORSHeaders(response, origin);
	} catch (error: any) {
		console.error("Checkout error:", error);
		const response = NextResponse.json(
			{ error: error.message || "Failed to create checkout session" },
			{ status: 500 }
		);
		return setCORSHeaders(response, request.headers.get("origin"));
	}
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request: NextRequest) {
	const response = new NextResponse(null, { status: 200 });
	return setCORSHeaders(response, request.headers.get("origin"));
}
