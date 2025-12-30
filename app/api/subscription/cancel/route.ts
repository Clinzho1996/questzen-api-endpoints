import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { disableSubscription } from "@/lib/paystack";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

// Interface for cancellation request
interface CancelSubscriptionRequest {
	reason?: string;
}

export async function POST(request: NextRequest) {
	try {
		const user = await requireAuth(request);

		if (!user || !user.userId) {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		const db = await getDatabase();

		// Get user data with subscription details
		const userData = await db.collection("users").findOne(
			{ _id: new ObjectId(user.userId) },
			{
				projection: {
					subscriptionTier: 1,
					subscriptionStatus: 1,
					paystackSubscriptionCode: 1,
					subscriptionDetails: 1,
					email: 1,
					displayName: 1,
					nextBillingDate: 1,
					subscriptionEndDate: 1,
					cancelledAt: 1,
					createdAt: 1,
				},
			}
		);

		if (!userData) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		// Check if user has an active premium subscription
		if (userData.subscriptionTier !== "premium") {
			return NextResponse.json(
				{
					error: {
						message: "No active premium subscription to cancel",
						code: "NO_ACTIVE_SUBSCRIPTION",
					},
				},
				{ status: 400 }
			);
		}

		if (userData.subscriptionStatus === "cancelled") {
			return NextResponse.json(
				{
					error: {
						message: "Subscription already cancelled",
						code: "ALREADY_CANCELLED",
					},
				},
				{ status: 400 }
			);
		}

		// Parse cancellation reason from request body
		const body: CancelSubscriptionRequest = await request
			.json()
			.catch(() => ({}));
		const reason = body.reason || "User requested cancellation";

		// Calculate subscription end date (end of current billing period)
		let endsAt: Date;

		if (userData.nextBillingDate) {
			// Subscription ends at the next billing date
			endsAt = new Date(userData.nextBillingDate);
		} else if (userData.subscriptionDetails?.nextPaymentDate) {
			// Use next payment date from subscription details
			endsAt = new Date(userData.subscriptionDetails.nextPaymentDate);
		} else {
			// Default: 30 days from now
			endsAt = new Date();
			endsAt.setDate(endsAt.getDate() + 30);
		}

		// Try to cancel with Paystack if subscription code exists
		let paystackCancelled = false;
		let paystackError = null;

		if (userData.paystackSubscriptionCode) {
			try {
				// Note: Paystack requires email token to disable subscription
				// You need to store this token when creating the subscription
				// For now, we'll attempt with a placeholder or skip if token not available

				// Check if we have email token stored in subscription details
				const emailToken =
					userData.subscriptionDetails?.emailToken ||
					userData.subscriptionDetails?.email_token ||
					"placeholder_token";

				if (emailToken !== "placeholder_token") {
					try {
						const response = await disableSubscription(
							userData.paystackSubscriptionCode,
							emailToken
						);

						// Check if the response indicates success
						// Since disableSubscription returns { data: PaystackSubscription }
						// We need to check if the subscription status indicates cancellation
						paystackCancelled =
							response.data?.status === "cancelled" ||
							response.data?.status === "non-renewing";

						if (!paystackCancelled) {
							paystackError = "Failed to cancel with Paystack";
							console.warn(
								"Paystack cancellation returned non-cancelled status:",
								response.data?.status
							);
						} else {
							console.log(
								"✅ Successfully cancelled Paystack subscription:",
								userData.paystackSubscriptionCode
							);
						}
					} catch (error) {
						paystackError =
							error instanceof Error ? error.message : "Unknown Paystack error";
						console.error("Paystack disableSubscription error:", error);
					}
				}
			} catch (error) {
				paystackError =
					error instanceof Error ? error.message : "Unknown Paystack error";
				console.error("Paystack cancellation error:", error);
			}
		}

		// Update user subscription status in database
		const now = new Date();
		const updateData: any = {
			$set: {
				subscriptionStatus: "cancelled",
				cancelledAt: now,
				subscriptionEndDate: endsAt,
				// Keep premium tier until the end date
				subscriptionTier: "premium",
			},
			$currentDate: {
				updatedAt: true,
			},
		};

		// Update subscription details if they exist
		if (userData.subscriptionDetails) {
			updateData.$set.subscriptionDetails = {
				...userData.subscriptionDetails,
				status: "cancelled",
				endsAt: endsAt.toISOString(),
				cancelledAt: now.toISOString(),
			};
		}

		// Log the cancellation for audit purposes
		const cancellationLog = {
			userId: user.userId,
			userEmail: userData.email,
			subscriptionCode: userData.paystackSubscriptionCode,
			reason: reason,
			cancelledAt: now,
			endsAt: endsAt,
			paystackCancelled: paystackCancelled,
			paystackError: paystackError,
			previousStatus: userData.subscriptionStatus,
		};

		// Update user record
		const result = await db
			.collection("users")
			.updateOne({ _id: new ObjectId(user.userId) }, updateData);

		if (result.modifiedCount === 0) {
			throw new Error("Failed to update subscription status");
		}

		// Store cancellation log
		await db
			.collection("subscription_cancellations")
			.insertOne(cancellationLog);

		// Return success response
		return NextResponse.json({
			success: true,
			message: "Subscription cancelled successfully",
			data: {
				subscriptionStatus: "cancelled",
				cancelledAt: now.toISOString(),
				endsAt: endsAt.toISOString(),
				premiumAccessUntil: endsAt.toISOString(),
				paystackCancelled: paystackCancelled,
				paystackError: paystackError,
				note: paystackCancelled
					? "Your subscription has been cancelled with Paystack. No further charges will be made."
					: "Your subscription has been cancelled locally. Please check your Paystack account to confirm cancellation.",
			},
		});
	} catch (error: any) {
		console.error("Subscription cancellation error:", error);

		// Log the error
		try {
			const db = await getDatabase();
			await db.collection("error_logs").insertOne({
				error: "subscription_cancellation_failed",
				message: error.message,
				timestamp: new Date(),
			});
		} catch (logError) {
			console.error("Failed to log error:", logError);
		}

		return NextResponse.json(
			{
				error: {
					message: "Failed to cancel subscription",
					code: "CANCELLATION_FAILED",
					details: error.message,
				},
			},
			{ status: 500 }
		);
	}
}

// Also implement GET method to check cancellation status
export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);

		if (!user || !user.userId) {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		const db = await getDatabase();
		const userData = await db.collection("users").findOne(
			{ _id: new ObjectId(user.userId) },
			{
				projection: {
					subscriptionTier: 1,
					subscriptionStatus: 1,
					cancelledAt: 1,
					subscriptionEndDate: 1,
					subscriptionDetails: 1,
				},
			}
		);

		if (!userData) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		return NextResponse.json({
			canCancel:
				userData.subscriptionTier === "premium" &&
				userData.subscriptionStatus !== "cancelled",
			currentStatus: userData.subscriptionStatus,
			tier: userData.subscriptionTier,
			cancelledAt: userData.cancelledAt?.toISOString(),
			endsAt: userData.subscriptionEndDate?.toISOString(),
			hasActiveSubscription:
				userData.subscriptionTier === "premium" &&
				userData.subscriptionStatus === "active",
		});
	} catch (error: any) {
		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}
		console.error("Cancellation status check error:", error);
		return NextResponse.json(
			{ error: { message: "Server error" } },
			{ status: 500 }
		);
	}
}
