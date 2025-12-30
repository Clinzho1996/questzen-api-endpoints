import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { getPaystack } from "@/lib/paystack";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

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
		const userData = await db.collection("users").findOne(
			{ _id: new ObjectId(user.userId) },
			{
				projection: {
					subscriptionTier: 1,
					subscriptionStatus: 1,
					paystackSubscriptionCode: 1,
					subscriptionDetails: 1,
					cancelledAt: 1,
					subscriptionEndDate: 1,
				},
			}
		);

		if (!userData) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		// Check if user has a cancelled subscription
		if (userData.subscriptionStatus !== "cancelled") {
			return NextResponse.json(
				{
					error: {
						message: "No cancelled subscription to reactivate",
						code: "NO_CANCELLED_SUBSCRIPTION",
					},
				},
				{ status: 400 }
			);
		}

		// Check if subscription end date has passed
		if (
			userData.subscriptionEndDate &&
			new Date(userData.subscriptionEndDate) < new Date()
		) {
			return NextResponse.json(
				{
					error: {
						message:
							"Subscription has expired. Please create a new subscription.",
						code: "SUBSCRIPTION_EXPIRED",
					},
				},
				{ status: 400 }
			);
		}

		// Try to reactivate with Paystack if subscription code exists
		let paystackReactivated = false;
		let paystackError = null;

		if (userData.paystackSubscriptionCode) {
			try {
				const paystack = getPaystack();

				// Note: Paystack may require different API call for reactivation
				// This depends on Paystack's API capabilities
				// For now, we'll update status locally and mark for manual follow-up

				// You might need to implement Paystack reactivation based on their API
				console.log(
					"Paystack reactivation required for:",
					userData.paystackSubscriptionCode
				);
				paystackError =
					"Manual reactivation required. Please contact support or create a new subscription.";
			} catch (error) {
				paystackError =
					error instanceof Error ? error.message : "Unknown Paystack error";
				console.error("Paystack reactivation error:", error);
			}
		}

		// Update user subscription status
		const now = new Date();
		const updateData: any = {
			$set: {
				subscriptionStatus: "active",
				subscriptionTier: "premium",
				cancelledAt: null,
				// Clear subscription end date since it's active again
				subscriptionEndDate: null,
			},
			$currentDate: {
				updatedAt: true,
			},
		};

		// Update subscription details if they exist
		if (userData.subscriptionDetails) {
			updateData.$set.subscriptionDetails = {
				...userData.subscriptionDetails,
				status: "active",
				endsAt: undefined,
				cancelledAt: undefined,
			};
		}

		// Update user record
		const result = await db
			.collection("users")
			.updateOne({ _id: new ObjectId(user.userId) }, updateData);

		if (result.modifiedCount === 0) {
			throw new Error("Failed to reactivate subscription");
		}

		// Log the reactivation
		await db.collection("subscription_reactivations").insertOne({
			userId: user.userId,
			subscriptionCode: userData.paystackSubscriptionCode,
			reactivatedAt: now,
			paystackReactivated: paystackReactivated,
			paystackError: paystackError,
		});

		return NextResponse.json({
			success: true,
			message: "Subscription reactivated successfully",
			data: {
				subscriptionStatus: "active",
				tier: "premium",
				reactivatedAt: now.toISOString(),
				paystackReactivated: paystackReactivated,
				paystackError: paystackError,
				note: paystackReactivated
					? "Your subscription has been reactivated with Paystack."
					: "Your subscription has been reactivated locally. Billing may require manual intervention.",
			},
		});
	} catch (error: any) {
		console.error("Subscription reactivation error:", error);

		return NextResponse.json(
			{
				error: {
					message: "Failed to reactivate subscription",
					code: "REACTIVATION_FAILED",
					details: error.message,
				},
			},
			{ status: 500 }
		);
	}
}
