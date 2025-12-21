// app/api/webhook/route.ts
import { getDatabase } from "@/lib/mongodb";
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

	console.log(`🔄 Webhook event type: ${event.type}`);

	const db = await getDatabase();

	// Handle the checkout.session.completed event
	if (event.type === "checkout.session.completed") {
		const session = event.data.object as Stripe.Checkout.Session;

		console.log("✅ Checkout session completed:", {
			sessionId: session.id,
			customerEmail: session.customer_details?.email,
			metadata: session.metadata,
		});

		// Get the user ID from metadata (this is Firebase UID from frontend)
		const firebaseUid = session.metadata?.userId;
		const planType = session.metadata?.planType || "monthly";

		if (!firebaseUid) {
			console.error("❌ No userId in session metadata");
			return NextResponse.json({ received: true });
		}

		try {
			// Get the subscription to check its status
			const subscription = await stripe.subscriptions.retrieve(
				session.subscription as string
			);

			console.log("📦 Subscription details:", {
				status: subscription.status,
				planId: subscription.items.data[0]?.price.id,
				customerId: subscription.customer,
			});

			// 🚨 CRITICAL: Your MongoDB users DON'T have firebaseUid field
			// So we need to find user by email instead
			const userEmail = session.customer_details?.email;

			if (!userEmail) {
				console.error("❌ No email in customer details");
				return NextResponse.json({ received: true });
			}

			// Look for user by email (since firebaseUid field doesn't exist)
			const user = await db.collection("users").findOne({
				email: userEmail,
			});

			if (!user) {
				console.error(`❌ User not found with email: ${userEmail}`);

				// Create new user since they don't exist in MongoDB
				const newUser = {
					email: userEmail,
					firebaseUid: firebaseUid, // Store the Firebase UID for future
					displayName: session.customer_details?.name || "",
					photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userEmail}`,
					subscriptionTier: "premium",
					subscriptionPlan: planType,
					stripeCustomerId: session.customer as string,
					stripeSubscriptionId: session.subscription as string,
					subscriptionStatus: subscription.status,
					currentPeriodEnd: new Date(subscription.current_period_end * 1000),
					streak: 0,
					longestStreak: 0,
					totalFocusMinutes: 0,
					level: 1,
					xp: 0,
					achievements: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				};

				const result = await db.collection("users").insertOne(newUser);
				console.log(
					`✅ Created new user for ${userEmail} with ID: ${result.insertedId}`
				);

				// Create subscription record
				await db.collection("subscriptions").insertOne({
					userId: result.insertedId,
					firebaseUid: firebaseUid,
					stripeCustomerId: session.customer,
					stripeSubscriptionId: session.subscription,
					planType: planType,
					status: subscription.status,
					currentPeriodEnd: new Date(subscription.current_period_end * 1000),
					createdAt: new Date(),
					updatedAt: new Date(),
				});
			} else {
				console.log(`✅ Found user in database: ${user._id}`);

				// Update existing user
				const updateResult = await db.collection("users").updateOne(
					{ _id: user._id },
					{
						$set: {
							// Add firebaseUid if missing
							firebaseUid: user.firebaseUid || firebaseUid,
							subscriptionTier: "premium",
							subscriptionPlan: planType,
							stripeCustomerId: session.customer as string,
							stripeSubscriptionId: session.subscription as string,
							subscriptionStatus: subscription.status,
							currentPeriodEnd: new Date(
								subscription.current_period_end * 1000
							),
							updatedAt: new Date(),
						},
					}
				);

				if (updateResult.modifiedCount > 0) {
					console.log(`✅ Updated user ${user._id} to premium subscription`);
				} else {
					console.log(`⚠️ User ${user._id} already had premium subscription`);
				}

				// Create subscription record
				await db.collection("subscriptions").insertOne({
					userId: user._id,
					firebaseUid: firebaseUid,
					stripeCustomerId: session.customer,
					stripeSubscriptionId: session.subscription,
					planType: planType,
					status: subscription.status,
					currentPeriodEnd: new Date(subscription.current_period_end * 1000),
					createdAt: new Date(),
					updatedAt: new Date(),
				});
			}
		} catch (error) {
			console.error("❌ Error updating user subscription:", error);
		}
	}

	// Handle subscription updates
	if (event.type === "customer.subscription.updated") {
		const subscription = event.data.object as Stripe.Subscription;

		console.log("🔄 Subscription updated:", {
			subscriptionId: subscription.id,
			customerId: subscription.customer,
			status: subscription.status,
			metadata: subscription.metadata,
		});

		try {
			// Get customer details from Stripe
			const customer = await stripe.customers.retrieve(
				subscription.customer as string
			);

			if (customer.deleted) {
				console.error("Customer deleted");
				return;
			}

			const customerEmail = "email" in customer ? customer.email : null;

			if (!customerEmail) {
				console.error("No email for customer");
				return;
			}

			// Find user by email
			const user = await db.collection("users").findOne({
				email: customerEmail,
			});

			if (user) {
				const updateData: any = {
					subscriptionStatus: subscription.status,
					currentPeriodEnd: new Date(subscription.current_period_end * 1000),
					updatedAt: new Date(),
				};

				// If subscription cancelled, downgrade to free
				if (
					subscription.status === "canceled" ||
					subscription.status === "unpaid"
				) {
					updateData.subscriptionTier = "free";
				}

				await db
					.collection("users")
					.updateOne({ _id: user._id }, { $set: updateData });

				console.log(
					`✅ Updated subscription status for user ${user._id} to ${subscription.status}`
				);
			}
		} catch (error) {
			console.error("Error updating subscription:", error);
		}
	}

	// Handle subscription cancellation
	if (event.type === "customer.subscription.deleted") {
		const subscription = event.data.object as Stripe.Subscription;

		console.log("🗑️ Subscription deleted:", {
			subscriptionId: subscription.id,
			customerId: subscription.customer,
		});

		try {
			// Get customer to find email
			const customer = await stripe.customers.retrieve(
				subscription.customer as string
			);

			if (!customer.deleted && "email" in customer && customer.email) {
				const user = await db.collection("users").findOne({
					email: customer.email,
				});

				if (user) {
					await db.collection("users").updateOne(
						{ _id: user._id },
						{
							$set: {
								subscriptionTier: "free",
								subscriptionStatus: "canceled",
								updatedAt: new Date(),
							},
						}
					);

					console.log(`✅ Downgraded user ${user._id} to free tier`);
				}
			}
		} catch (error) {
			console.error("Error downgrading user:", error);
		}
	}

	return NextResponse.json({ received: true });
}
