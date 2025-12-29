// app/api/subscription/verify-payment/route.ts
export const runtime = "nodejs";

import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { getPaystack } from "@/lib/paystack";
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

		// Verify payment with Paystack
		const verification = await paystack.verifyTransaction(reference);

		if (!verification.data.status || verification.data.status !== "success") {
			return NextResponse.json(
				{
					success: false,
					message: "Payment not successful",
					data: verification.data,
				},
				{ status: 400 }
			);
		}

		const db = await getDatabase();

		// Get plan from metadata
		const plan = verification.data.metadata?.plan || "monthly";
		const subscriptionTier = "premium";

		// Update user subscription
		await db.collection("users").updateOne(
			{ _id: new ObjectId(user.userId) },
			{
				$set: {
					subscriptionTier,
					subscriptionStatus: "active",
					lastPaymentDate: new Date(),
					plan,
					paystackSubscriptionId: verification.data.id,
					updatedAt: new Date(),
				},
			}
		);

		return NextResponse.json({
			success: true,
			message: "Payment verified and subscription activated",
			data: {
				amount: verification.data.amount / 100, // Convert from kobo
				currency: verification.data.currency,
				plan,
				subscriptionTier,
				reference: verification.data.reference,
			},
		});
	} catch (error: any) {
		console.error("Payment verification error:", error);

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
			},
			{ status: 500 }
		);
	}
}
