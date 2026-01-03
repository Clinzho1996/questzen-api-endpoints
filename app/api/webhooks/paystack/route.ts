import { getDatabase } from "@/lib/mongodb";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

function verifySignature(body: string, signature: string | null) {
	if (!signature) return false;

	const hash = crypto
		.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
		.update(body)
		.digest("hex");

	return hash === signature;
}

export async function POST(request: NextRequest) {
	const rawBody = await request.text();
	const signature = request.headers.get("x-paystack-signature");

	if (!verifySignature(rawBody, signature)) {
		return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
	}

	const event = JSON.parse(rawBody);
	const db = await getDatabase();

	try {
		switch (event.event) {
			case "subscription.create": {
				const { subscription_code, email_token, customer } = event.data;

				await db.collection("users").updateOne(
					{ paystackCustomerCode: customer.customer_code },
					{
						$set: {
							paystackSubscriptionCode: subscription_code,
							paystackEmailToken: email_token,
							subscriptionStatus: "active",
						},
					}
				);
				break;
			}

			case "invoice.payment_success": {
				const { subscription, customer, paid_at } = event.data;

				const startDate = new Date(paid_at);
				const nextBillingDate = new Date(startDate);

				if (subscription.interval === "annually") {
					nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
				} else {
					nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
				}

				await db.collection("users").updateOne(
					{ paystackCustomerCode: customer.customer_code },
					{
						$set: {
							subscriptionStatus: "active",
							lastPaymentDate: startDate,
							nextBillingDate,
							subscriptionTier: "premium",
						},
					}
				);
				break;
			}

			case "invoice.payment_failed": {
				await db.collection("users").updateOne(
					{ paystackCustomerCode: event.data.customer.customer_code },
					{
						$set: {
							subscriptionStatus: "past_due",
						},
					}
				);
				break;
			}

			case "subscription.disable": {
				await db.collection("users").updateOne(
					{ paystackCustomerCode: event.data.customer.customer_code },
					{
						$set: {
							subscriptionStatus: "cancelled",
							subscriptionTier: "free",
						},
					}
				);
				break;
			}
		}

		return NextResponse.json({ received: true });
	} catch (err) {
		console.error("Webhook processing error:", err);
		return NextResponse.json({ error: "Webhook error" }, { status: 500 });
	}
}
