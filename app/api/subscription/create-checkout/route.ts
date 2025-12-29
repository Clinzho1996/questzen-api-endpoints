// app/api/subscription/create-checkout/route.ts
export const runtime = "nodejs"; // Use Edge runtime for better compatibility

import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { getPaystack, PLAN_CODES } from "@/lib/paystack";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const body = await request.json();
		const { plan } = body;

		if (!plan || !["monthly", "yearly"].includes(plan)) {
			return NextResponse.json(
				{ error: { message: "Invalid plan" } },
				{ status: 400 }
			);
		}

		const db = await getDatabase();
		const userData = await db.collection("users").findOne({
			_id: new ObjectId(user.userId),
		});

		if (!userData) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		const paystack = getPaystack();
		let paystackCustomerCode = userData.paystackCustomerCode;

		if (!paystackCustomerCode) {
			const customer = await paystack.createCustomer({
				email: userData.email,
				first_name: userData.displayName?.split(" ")[0] || "Customer",
				last_name: userData.displayName?.split(" ")[1] || "",
				metadata: { userId: user.userId },
			});

			paystackCustomerCode = customer.data.customer_code;

			await db
				.collection("users")
				.updateOne(
					{ _id: new ObjectId(user.userId) },
					{ $set: { paystackCustomerCode } }
				);
		}

		const planCode =
			plan === "monthly"
				? PLAN_CODES.premium_monthly
				: PLAN_CODES.premium_yearly;

		if (!planCode) {
			return NextResponse.json(
				{ error: { message: "Plan not configured" } },
				{ status: 500 }
			);
		}

		const transaction = await paystack.initializeTransaction({
			email: userData.email,
			amount: plan === "monthly" ? 200000 : 2100000,
			plan: planCode,
			metadata: {
				userId: user.userId,
				plan,
				customerCode: paystackCustomerCode,
			},
			callback_url: `${
				process.env.FRONTEND_URL || "http://localhost:3001"
			}/upgrade/callback`,
			reference: `QUESTZEN_${Date.now()}_${user.userId.substring(0, 8)}`,
		});

		return NextResponse.json({
			authorizationUrl: transaction.data.authorization_url,
			reference: transaction.data.reference,
			message: "Payment initialized successfully",
		});
	} catch (error: any) {
		console.error("Create checkout error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{ error: { message: "Server error", details: error.message } },
			{ status: 500 }
		);
	}
}

// Add GET for testing
export async function GET() {
	return NextResponse.json({
		message: "Subscription checkout endpoint",
		status: "active",
		timestamp: new Date().toISOString(),
	});
}
