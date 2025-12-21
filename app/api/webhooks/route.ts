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
	console.log("Full event data:", JSON.stringify(event.data.object, null, 2));

	const db = await getDatabase();

	// Handle the checkout.session.completed event
	if (event.type === "checkout.session.completed") {
		const session = event.data.object as Stripe.Checkout.Session;

		console.log("Checkout session completed - Processing:", {
			sessionId: session.id,
			customerId: session.customer,
			subscriptionId: session.subscription,
			metadata: session.metadata,
			userId: session.metadata?.userId,
		});

		// Get the user ID from metadata
		const userId = session.metadata?.userId;
		const planType = session.metadata?.planType;

		if (!userId) {
			console.error("❌ No userId in session metadata");
			return NextResponse.json({ received: true });
		}

		try {
			// Get the subscription to check its status
			const subscription = await stripe.subscriptions.retrieve(
				session.subscription as string
			);

			console.log("✅ Subscription details:", {
				status: subscription.status,
				plan: subscription.items.data[0].price.id,
				customerId: subscription.customer,
			});

			// 🚨 CRITICAL FIX: You need to find the user by Firebase UID, not MongoDB ObjectId
			// Assuming your MongoDB users collection has a 'firebaseUid' field
			const user = await db.collection("users").findOne({
				firebaseUid: userId, // Look for Firebase UID
			});

			if (!user) {
				console.error(`❌ User not found with firebaseUid: ${userId}`);

				// Try alternative: look by email
				const userEmail = session.customer_details?.email;
				if (userEmail) {
					const userByEmail = await db.collection("users").findOne({
						email: userEmail,
					});

					if (userByEmail) {
						console.log(`✅ Found user by email: ${userEmail}`);
						await updateUserSubscription(
							db,
							userByEmail._id,
							session,
							subscription,
							userId
						);
					} else {
						console.error(`❌ User not found by email either: ${userEmail}`);
					}
				}
			} else {
				console.log(`✅ Found user in database: ${user._id}`);
				await updateUserSubscription(
					db,
					user._id,
					session,
					subscription,
					userId
				);
			}
		} catch (error) {
			console.error("❌ Error updating user subscription:", error);
		}
	}

	// Also handle invoice.payment_succeeded for additional safety
	if (event.type === "invoice.payment_succeeded") {
		const invoice = event.data.object as Stripe.Invoice;

		console.log("Invoice payment succeeded:", {
			invoiceId: invoice.id,
			subscriptionId: invoice.subscription,
			customerId: invoice.customer,
		});

		if (invoice.subscription) {
			try {
				const subscription = await stripe.subscriptions.retrieve(
					invoice.subscription as string
				);

				// Check if subscription has metadata
				if (subscription.metadata?.userId) {
					const userId = subscription.metadata.userId;
					await updateUserFromSubscription(db, userId, subscription);
				}
			} catch (error) {
				console.error("Error processing invoice webhook:", error);
			}
		}
	}

	return NextResponse.json({ received: true });
}

// Helper function to update user subscription
async function updateUserSubscription(
	db: any,
	userId: ObjectId,
	session: Stripe.Checkout.Session,
	subscription: Stripe.Subscription,
	firebaseUid: string
) {
	try {
		// Update user in database
		const result = await db.collection("users").updateOne(
			{ _id: userId },
			{
				$set: {
					subscriptionTier: "premium",
					subscriptionPlan: session.metadata?.planType || "monthly",
					stripeCustomerId: session.customer as string,
					stripeSubscriptionId: session.subscription as string,
					subscriptionStatus: subscription.status,
					currentPeriodEnd: new Date(subscription.current_period_end * 1000),
					updatedAt: new Date(),
					// Also store the Firebase UID if not already stored
					firebaseUid: firebaseUid,
				},
			}
		);

		if (result.modifiedCount > 0) {
			console.log(
				`✅ Successfully updated user ${userId} to premium subscription`
			);
			console.log("Update details:", {
				stripeCustomerId: session.customer,
				stripeSubscriptionId: session.subscription,
				status: subscription.status,
				periodEnd: new Date(subscription.current_period_end * 1000),
			});
		} else {
			console.log(
				`⚠️ User ${userId} already had premium subscription or no changes needed`
			);
		}

		// Optional: Create a subscription record
		await db.collection("subscriptions").insertOne({
			userId: userId,
			firebaseUid: firebaseUid,
			stripeCustomerId: session.customer,
			stripeSubscriptionId: session.subscription,
			planType: session.metadata?.planType || "monthly",
			status: subscription.status,
			currentPeriodEnd: new Date(subscription.current_period_end * 1000),
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	} catch (error) {
		console.error("❌ Error in updateUserSubscription:", error);
		throw error;
	}
}

// Helper function to update user from subscription metadata
async function updateUserFromSubscription(
	db: any,
	userId: string,
	subscription: Stripe.Subscription
) {
	try {
		// Find user by Firebase UID
		const user = await db.collection("users").findOne({
			firebaseUid: userId,
		});

		if (user) {
			await db.collection("users").updateOne(
				{ _id: user._id },
				{
					$set: {
						subscriptionTier: "premium",
						stripeCustomerId: subscription.customer as string,
						stripeSubscriptionId: subscription.id,
						subscriptionStatus: subscription.status,
						currentPeriodEnd: new Date(subscription.current_period_end * 1000),
						updatedAt: new Date(),
					},
				}
			);
			console.log(`✅ Updated user ${user._id} from subscription webhook`);
		}
	} catch (error) {
		console.error("Error updating user from subscription:", error);
	}
}
