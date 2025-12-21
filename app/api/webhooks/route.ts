// app/api/webhook/route.ts
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
	apiVersion: "2023-10-16",
});

export async function POST(request: NextRequest) {
	const body = await request.text();
	const sig = request.headers.get("stripe-signature")!;

	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(
			body,
			sig,
			process.env.STRIPE_WEBHOOK_SECRET!
		);
	} catch (err: any) {
		console.error(`Webhook signature verification failed:`, err.message);
		return NextResponse.json(
			{ error: `Webhook Error: ${err.message}` },
			{ status: 400 }
		);
	}

	console.log(`Webhook event type: ${event.type}`);

	const db = await getDatabase();

	// Handle the checkout.session.completed event
	if (event.type === "checkout.session.completed") {
		const session = event.data.object as Stripe.Checkout.Session;

		console.log("Checkout session completed:", {
			sessionId: session.id,
			customerId: session.customer,
			subscriptionId: session.subscription,
			metadata: session.metadata,
		});

		// Get the user ID from metadata
		const userId = session.metadata?.userId;

		if (!userId) {
			console.error("No userId in session metadata");
			return NextResponse.json({ received: true });
		}

		try {
			// Get the subscription to check its status
			const subscription = await stripe.subscriptions.retrieve(
				session.subscription as string
			);

			console.log("Subscription details:", {
				status: subscription.status,
				plan: subscription.items.data[0].price.id,
			});

			// Update user in database
			await db.collection("users").updateOne(
				{ _id: new ObjectId(userId) },
				{
					$set: {
						subscriptionTier: "premium",
						stripeCustomerId: session.customer as string,
						stripeSubscriptionId: session.subscription as string,
						subscriptionStatus: subscription.status,
						currentPeriodEnd: new Date(subscription.current_period_end * 1000),
						updatedAt: new Date(),
					},
				}
			);

			console.log(`Updated user ${userId} to premium subscription`);
		} catch (error) {
			console.error("Error updating user subscription:", error);
		}
	}

	// Handle subscription updates
	if (event.type === "customer.subscription.updated") {
		const subscription = event.data.object as Stripe.Subscription;

		console.log("Subscription updated:", {
			subscriptionId: subscription.id,
			customerId: subscription.customer,
			status: subscription.status,
		});

		try {
			// Find user by stripeCustomerId
			const user = await db.collection("users").findOne({
				stripeCustomerId: subscription.customer as string,
			});

			if (user) {
				await db.collection("users").updateOne(
					{ _id: user._id },
					{
						$set: {
							subscriptionStatus: subscription.status,
							currentPeriodEnd: new Date(
								subscription.current_period_end * 1000
							),
							updatedAt: new Date(),
						},
					}
				);

				console.log(
					`Updated subscription status for user ${user._id} to ${subscription.status}`
				);
			}
		} catch (error) {
			console.error("Error updating subscription:", error);
		}
	}

	// Handle subscription cancellation
	if (event.type === "customer.subscription.deleted") {
		const subscription = event.data.object as Stripe.Subscription;

		console.log("Subscription deleted:", {
			subscriptionId: subscription.id,
			customerId: subscription.customer,
		});

		try {
			// Find user by stripeCustomerId
			const user = await db.collection("users").findOne({
				stripeCustomerId: subscription.customer as string,
			});

			if (user) {
				await db.collection("users").updateOne(
					{ _id: user._id },
					{
						$set: {
							subscriptionTier: "free",
							subscriptionStatus: "canceled",
							stripeSubscriptionId: null,
							updatedAt: new Date(),
						},
					}
				);

				console.log(`Downgraded user ${user._id} to free tier`);
			}
		} catch (error) {
			console.error("Error downgrading user:", error);
		}
	}

	return NextResponse.json({ received: true });
}
