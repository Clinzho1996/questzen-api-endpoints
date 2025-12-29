// app/api/subscription/create-checkout/route.ts - UPDATED
export const runtime = "nodejs";

import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { getPaystack, PLAN_CODES } from "@/lib/paystack";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		// Initialize Paystack first with error handling
		let paystack;
		try {
			paystack = getPaystack();
			console.log("✅ Paystack initialized successfully");
		} catch (error: any) {
			console.error("❌ Failed to initialize Paystack:", error.message);
			return NextResponse.json(
				{ error: { message: "Payment service configuration error" } },
				{ status: 500 }
			);
		}

		// Authenticate user
		const user = await requireAuth(request);

		// Parse request body
		let body;
		try {
			body = await request.json();
		} catch {
			return NextResponse.json(
				{ error: { message: "Invalid JSON body" } },
				{ status: 400 }
			);
		}

		const { plan } = body;

		// Validate plan
		if (!plan || !["monthly", "yearly"].includes(plan)) {
			return NextResponse.json(
				{ error: { message: "Invalid plan" } },
				{ status: 400 }
			);
		}

		// Get database connection
		const db = await getDatabase();

		// Find user
		const userData = await db.collection("users").findOne({
			_id: new ObjectId(user.userId),
		});

		if (!userData) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		console.log("👤 Processing subscription for:", userData.email);
		console.log("📅 Selected plan:", plan);

		// Get or create Paystack customer
		let paystackCustomerCode = userData.paystackCustomerCode;

		if (!paystackCustomerCode) {
			console.log("👤 Creating new Paystack customer");
			try {
				const customer = await paystack.customer.create({
					email: userData.email,
					first_name: userData.displayName?.split(" ")[0] || "Customer",
					last_name: userData.displayName?.split(" ")[1] || "",
					metadata: { userId: user.userId },
				});

				paystackCustomerCode = customer.data.customer_code;
				console.log("✅ Created customer with code:", paystackCustomerCode);

				// Save to database
				await db
					.collection("users")
					.updateOne(
						{ _id: new ObjectId(user.userId) },
						{ $set: { paystackCustomerCode } }
					);
			} catch (error: any) {
				console.error("❌ Failed to create Paystack customer:", error);
				return NextResponse.json(
					{ error: { message: "Failed to create customer record" } },
					{ status: 500 }
				);
			}
		} else {
			console.log("👤 Using existing customer code:", paystackCustomerCode);
		}

		// Get plan code
		const planCode =
			plan === "monthly"
				? PLAN_CODES.premium_monthly
				: PLAN_CODES.premium_yearly;

		console.log("💰 Using plan code:", planCode);

		if (!planCode) {
			return NextResponse.json(
				{ error: { message: "Plan not configured" } },
				{ status: 500 }
			);
		}

		// Initialize transaction
		console.log("💳 Initializing Paystack transaction...");
		let transaction;
		try {
			transaction = await paystack.transaction.initialize({
				email: userData.email,
				amount: plan === "monthly" ? 500000 : 5000000,
				plan: planCode,
				metadata: {
					userId: user.userId,
					plan,
					customerCode: paystackCustomerCode,
				},
				callback_url: `${
					process.env.FRONTEND_URL || "http://localhost:3001"
				}/upgrade?success=true`,
				reference: `QUESTZEN_${Date.now()}_${user.userId.substring(0, 8)}`,
			});

			console.log("✅ Transaction initialized:", transaction.data.reference);
		} catch (error: any) {
			console.error("❌ Paystack transaction failed:", error);

			// Provide more specific error messages
			let errorMessage = "Payment initialization failed";
			if (error.message?.includes("Invalid authorization key")) {
				errorMessage = "Invalid payment service configuration";
			} else if (error.message?.includes("Invalid plan")) {
				errorMessage = "Selected plan is not available";
			}

			return NextResponse.json(
				{ error: { message: errorMessage, details: error.message } },
				{ status: 500 }
			);
		}

		// Return success response
		return NextResponse.json({
			authorizationUrl: transaction.data.authorization_url,
			reference: transaction.data.reference,
			message: "Payment initialized successfully",
		});
	} catch (error: any) {
		console.error("❌ Create checkout error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{
				error: {
					message: "Server error",
					details:
						process.env.NODE_ENV === "development" ? error.message : undefined,
				},
			},
			{ status: 500 }
		);
	}
}

// Add GET method to test the endpoint
export async function GET(request: NextRequest) {
	return NextResponse.json({
		message: "Subscription checkout endpoint",
		status: "active",
		paymentProvider: "Paystack",
		timestamp: new Date().toISOString(),
	});
}
