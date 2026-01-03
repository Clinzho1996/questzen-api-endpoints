import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { getPaystack, PaystackSubscription } from "@/lib/paystack";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

/* =======================
   Interfaces
======================= */

interface SubscriptionDetails {
	planCode?: string;
	planName: string;
	status: "active" | "cancelled" | "expired" | "inactive";
	nextPaymentDate?: string;
	amount?: number;
	currency: string;
	interval: "monthly" | "yearly";
	startDate: string;
	cancelledAt?: string;
	endsAt?: string;
	subscriptionCode?: string;
}

/* =======================
   GET Handler
======================= */

export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);

		if (!user?.userId) {
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
					paystackCustomerCode: 1,
					paystackSubscriptionCode: 1,
					subscriptionStatus: 1,
					subscriptionDetails: 1,
					createdAt: 1,
					updatedAt: 1,
					premiumSince: 1,
					subscriptionStartDate: 1,
					subscriptionEndDate: 1,
					nextBillingDate: 1,
					lastPaymentDate: 1,
					cancelledAt: 1,
				},
			}
		);

		if (!userData) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		const tier = userData.subscriptionTier || "free";
		let subscriptionDetails: SubscriptionDetails | undefined;

		/* =======================
		   Fetch Paystack Data
		======================= */

		if (tier === "premium" && userData.paystackSubscriptionCode) {
			try {
				const paystack = getPaystack();

				const { data: paystackData }: { data: PaystackSubscription } =
					await paystack.getSubscription(userData.paystackSubscriptionCode);

				if (paystackData) {
					const plan = paystackData.plan;

					const nextPaymentDate = paystackData.next_payment_date
						? new Date(paystackData.next_payment_date).toISOString()
						: undefined;

					const cancelledAt = paystackData.cancelledAt
						? new Date(paystackData.cancelledAt).toISOString()
						: undefined;

					const endsAt = paystackData.ends_at
						? new Date(paystackData.ends_at).toISOString()
						: undefined;

					subscriptionDetails = {
						planCode: plan?.plan_code || "premium_monthly",
						planName: plan?.name || "Premium Plan",
						status: mapPaystackStatus(paystackData.status),
						nextPaymentDate,
						amount: plan?.amount || 0,
						currency: "NGN",
						interval: getIntervalFromPlan(plan?.interval, plan?.plan_code),
						startDate: new Date(paystackData.createdAt).toISOString(),
						cancelledAt: cancelledAt ?? userData.cancelledAt?.toISOString(),
						endsAt: endsAt ?? userData.subscriptionEndDate?.toISOString(),
						subscriptionCode: userData.paystackSubscriptionCode,
					};

					await db.collection("users").updateOne(
						{ _id: new ObjectId(user.userId) },
						{
							$set: {
								subscriptionDetails,
								nextBillingDate: nextPaymentDate
									? new Date(nextPaymentDate)
									: null,
								subscriptionEndDate: endsAt ? new Date(endsAt) : null,
								cancelledAt: cancelledAt ? new Date(cancelledAt) : null,
								subscriptionStatus: subscriptionDetails.status,
							},
							$currentDate: { updatedAt: true },
						}
					);
				}
			} catch (err) {
				console.error("Paystack fetch failed:", err);
			}
		}

		/* =======================
		   Fallback Logic
		======================= */

		if (!subscriptionDetails && userData.subscriptionDetails) {
			subscriptionDetails = userData.subscriptionDetails as SubscriptionDetails;
		}

		// Update the fallback logic section:
		if (!subscriptionDetails && tier === "premium") {
			const startDate =
				userData.premiumSince ??
				userData.subscriptionStartDate ??
				userData.createdAt;

			// Get plan interval from user data
			const plan = userData.plan || "monthly";
			const interval = plan === "yearly" ? "yearly" : "monthly";
			const amount = plan === "yearly" ? 28000 : 2500;

			subscriptionDetails = {
				planCode: plan === "yearly" ? "premium_yearly" : "premium_monthly",
				planName: plan === "yearly" ? "Premium Yearly" : "Premium Monthly",
				status: userData.subscriptionStatus || "active",
				nextPaymentDate:
					userData.nextBillingDate?.toISOString() ??
					calculateNextPaymentDate(startDate, interval),
				amount,
				currency: "NGN",
				interval,
				startDate: startDate.toISOString(),
				cancelledAt: userData.cancelledAt?.toISOString(),
				endsAt: userData.subscriptionEndDate?.toISOString(),
				subscriptionCode: userData.paystackSubscriptionCode,
			};
		}

		return NextResponse.json({
			tier,
			subscriptionStatus: userData.subscriptionStatus || "inactive",
			paystackCustomerCode: userData.paystackCustomerCode || null,
			subscriptionDetails,
			dates: {
				createdAt: userData.createdAt?.toISOString(),
				premiumSince: userData.premiumSince?.toISOString(),
				subscriptionStartDate: userData.subscriptionStartDate?.toISOString(),
				lastPaymentDate: userData.lastPaymentDate?.toISOString(),
				nextBillingDate: userData.nextBillingDate?.toISOString(),
				subscriptionEndDate: userData.subscriptionEndDate?.toISOString(),
				cancelledAt: userData.cancelledAt?.toISOString(),
			},
		});
	} catch (error: any) {
		if (error?.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		console.error("Subscription fetch error:", error);
		return NextResponse.json(
			{ error: { message: "Server error" } },
			{ status: 500 }
		);
	}
}

/* =======================
   Helpers
======================= */

function mapPaystackStatus(
	status: string
): "active" | "cancelled" | "expired" | "inactive" {
	switch (status?.toLowerCase()) {
		case "active":
			return "active";
		case "non-renewing":
		case "cancelled":
			return "cancelled";
		case "expired":
			return "expired";
		default:
			return "inactive";
	}
}

function getIntervalFromPlan(
	interval?: string,
	planCode?: string
): "monthly" | "yearly" {
	if (!interval) {
		// Check plan code if interval is not provided
		if (planCode?.includes("yearly") || planCode?.includes("annual")) {
			return "yearly";
		}
		return "monthly";
	}

	// Clean and check the interval string
	const cleanInterval = interval.toLowerCase();
	if (
		cleanInterval.includes("year") ||
		cleanInterval.includes("annual") ||
		cleanInterval.includes("annually")
	) {
		return "yearly";
	}
	return "monthly";
}

// Replace the calculateNextPaymentDate function:
function calculateNextPaymentDate(
	startDate: Date,
	interval?: "monthly" | "yearly"
): string {
	const date = new Date(startDate);
	if (interval === "yearly") {
		date.setFullYear(date.getFullYear() + 1);
	} else {
		date.setDate(date.getDate() + 30); // Monthly
	}
	return date.toISOString();
}
