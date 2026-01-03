// app/api/subscription/verify-payment/route.ts
export const runtime = "nodejs";

import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { getPaystack, PLAN_CODES } from "@/lib/paystack";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const searchParams = request.nextUrl.searchParams;
		const reference = searchParams.get("reference");

		if (!reference) {
			return NextResponse.json(
				{ error: { message: "Reference is required" } },
				{ status: 400 }
			);
		}

		const paystack = getPaystack();
		const db = await getDatabase();

		// Step 1: Verify payment
		console.log(`🔍 Verifying payment: ${reference}`);
		const verification = await paystack.verifyTransaction(reference);

		if (verification.data.status !== "success") {
			return NextResponse.json(
				{
					success: false,
					message: `Payment ${verification.data.status || "failed"}`,
					data: verification.data,
				},
				{ status: 400 }
			);
		}

		console.log("✅ Payment verified successfully");

		// Step 2: Extract data
		const plan = verification.data.metadata?.plan || "monthly";
		const isYearly = plan === "yearly";
		const customerCode =
			verification.data.metadata?.customerCode ||
			verification.data.customer?.customer_code;
		const authorizationCode =
			verification.data.authorization?.authorization_code;

		console.log("📋 Payment Details:", {
			plan,
			isYearly,
			customerCode,
			authorizationCode: authorizationCode ? "✅" : "❌",
			amount: (verification.data.amount / 100).toLocaleString("en-NG", {
				style: "currency",
				currency: "NGN",
			}),
		});

		// Step 3: Check for existing subscription
		let subscriptionCode: string | undefined;
		let subscriptionCreated = false;

		if (customerCode) {
			try {
				// Check if customer already has a subscription
				const subscriptions = await paystack.listSubscriptions({
					customer: customerCode,
					perPage: 10,
				});

				// Look for active subscriptions
				const activeSubscriptions = subscriptions.data.filter(
					(sub: any) => sub.status === "active" || sub.status === "non-renewing"
				);

				if (activeSubscriptions.length > 0) {
					subscriptionCode = activeSubscriptions[0].subscription_code;
					console.log(`📞 Found existing subscription: ${subscriptionCode}`);
				}
			} catch (error) {
				console.log("⚠️ No existing subscriptions found or error checking");
			}
		}

		// Step 4: Create new subscription if needed
		if (!subscriptionCode && customerCode && authorizationCode) {
			console.log("🔄 Creating new subscription...");

			const planCode = isYearly
				? PLAN_CODES.premium_yearly
				: PLAN_CODES.premium_monthly;

			if (!planCode) {
				console.error(
					"❌ Plan code not configured for",
					isYearly ? "yearly" : "monthly"
				);
			} else {
				try {
					const subscriptionResponse = await paystack.createSubscription({
						customer: customerCode,
						plan: planCode,
						authorization: authorizationCode,
						start_date: verification.data.paid_at || new Date().toISOString(),
					});

					subscriptionCode = subscriptionResponse.data.subscription_code;
					subscriptionCreated = true;
					console.log(`✅ Subscription created: ${subscriptionCode}`);
				} catch (error: any) {
					console.error("❌ Failed to create subscription:", error.message);
					// Log more details for debugging
					console.log("Subscription creation failed with:", {
						customerCode,
						planCode,
						authorizationCode,
						error: error.message,
					});
				}
			}
		}

		// Step 5: Calculate billing dates
		const now = new Date();
		const startDate = verification.data.paid_at
			? new Date(verification.data.paid_at)
			: now;

		// Calculate next billing date
		const nextBillingDate = new Date(startDate);
		if (isYearly) {
			nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
		} else {
			nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
		}

		// Step 6: Update user in database
		const updateData: any = {
			subscriptionTier: "premium",
			subscriptionStatus: "active",
			lastPaymentDate: startDate,
			plan,
			paystackSubscriptionId: verification.data.id,
			paystackTransactionReference: reference,
			updatedAt: now,
			premiumSince: startDate,
			subscriptionStartDate: startDate,
			nextBillingDate,
			paystackCustomerCode: customerCode,
			// Store the authorization for future use
			paystackAuthorization: authorizationCode,
		};

		// Only add subscription code if we have it
		if (subscriptionCode) {
			updateData.paystackSubscriptionCode = subscriptionCode;
		}

		await db
			.collection("users")
			.updateOne({ _id: new ObjectId(user.userId) }, { $set: updateData });

		console.log("✅ User database updated successfully");

		// Step 7: Return response
		const responseData = {
			success: true,
			message: subscriptionCreated
				? "Payment verified and subscription created"
				: subscriptionCode
				? "Payment verified and subscription found"
				: "Payment verified - premium access granted",
			data: {
				amount: verification.data.amount / 100,
				currency: verification.data.currency,
				plan,
				interval: isYearly ? "yearly" : "monthly",
				subscriptionTier: "premium",
				reference: verification.data.reference,
				subscriptionCode,
				hasSubscription: !!subscriptionCode,
				subscriptionCreated,
				nextBillingDate: nextBillingDate.toISOString(),
				billingPeriod: isYearly ? "yearly" : "monthly",
				customerCode,
			},
		};

		console.log("📤 Returning response:", {
			...responseData,
			data: {
				...responseData.data,
				subscriptionCode: subscriptionCode ? "✅" : "❌",
			},
		});

		return NextResponse.json(responseData);
	} catch (error: any) {
		console.error("❌ Payment verification error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{
				success: false,
				message: error.message || "Payment verification failed",
				error: process.env.NODE_ENV === "development" ? error.stack : undefined,
			},
			{ status: 500 }
		);
	}
}

export async function OPTIONS(request: NextRequest) {
	const headers = new Headers();
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
	headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

	return new NextResponse(null, { status: 200, headers });
}
