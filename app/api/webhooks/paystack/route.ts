// app/api/webhooks/paystack/route.ts
import { getDatabase } from "@/lib/mongodb";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const body = await request.text();
		const signature = request.headers.get("x-paystack-signature");

		// Verify webhook signature
		const hash = crypto
			.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
			.update(body)
			.digest("hex");

		if (hash !== signature) {
			return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
		}

		const event = JSON.parse(body);
		const db = await getDatabase();

		// Handle different Paystack events
		switch (event.event) {
			case "charge.success":
				// Update user subscription status
				await db.collection("users").updateOne(
					{ paystackCustomerCode: event.data.customer.customer_code },
					{
						$set: {
							subscriptionTier: "premium",
							subscriptionStatus: "active",
							paystackSubscriptionCode:
								event.data.subscription?.subscription_code,
						},
					}
				);
				break;

			case "subscription.create":
				// Handle subscription creation
				break;

			case "subscription.disable":
				// Handle subscription cancellation
				await db
					.collection("users")
					.updateOne(
						{ paystackCustomerCode: event.data.customer.customer_code },
						{ $set: { subscriptionStatus: "cancelled" } }
					);
				break;
		}

		return NextResponse.json({ received: true });
	} catch (error) {
		console.error("Paystack webhook error:", error);
		return NextResponse.json({ error: "Webhook error" }, { status: 500 });
	}
}
