import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { paystack, PLAN_CODES } from "@/lib/paystack";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
export async function POST(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const body = await request.json();
		const { plan } = body; // 'monthly' or 'yearly'

		if (!plan || !["monthly", "yearly"].includes(plan)) {
			return NextResponse.json(
				{
					error: {
						message: "Invalid plan",
					},
				},
				{
					status: 400,
				}
			);
		}
		const db = await getDatabase();
		const userData = await db.collection("users").findOne({
			_id: new ObjectId(user.userId),
		});
		if (!userData) {
			return NextResponse.json(
				{
					error: {
						message: "User not found",
					},
				},
				{
					status: 404,
				}
			);
		}

		// Get or create Stripe customer
		let paystackCustomerCode = userData.paystackCustomerCode; // New field
		if (!paystackCustomerCode) {
			const customer = await paystack.customer.create({
				email: userData.email,
				first_name: userData.displayName?.split(" ")[0] || "Customer",
				last_name: userData.displayName?.split(" ")[1] || "",
				metadata: {
					userId: user.userId,
				},
			});
			paystackCustomerCode = customer.data.customer_code;

			// Save the Paystack customer code to your database
			await db
				.collection("users")
				.updateOne(
					{ _id: new ObjectId(user.userId) },
					{ $set: { paystackCustomerCode } }
				);
		}

		// Initialize a Paystack transaction for subscription
		const planCode =
			plan === "monthly"
				? PLAN_CODES.premium_monthly
				: PLAN_CODES.premium_yearly;

		const transaction = await paystack.transaction.initialize({
			email: userData.email,
			amount: plan === "monthly" ? 500000 : 5000000, // Amount in kobo (e.g., 5000 NGN = 500000 kobo)
			plan: planCode,
			metadata: {
				userId: user.userId,
				plan: plan,
				customerCode: paystackCustomerCode,
			},
			callback_url: `${process.env.FRONTEND_URL}/upgrade?success=true`,
		});

		return NextResponse.json({
			authorizationUrl: transaction.data.authorization_url, // Paystack uses authorization_url
			reference: transaction.data.reference, // For verifying payment
		});
	} catch (error: any) {
		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{
					error: {
						message: "Unauthorized",
					},
				},
				{
					status: 401,
				}
			);
		}
		console.error("Create checkout error:", error);
		return NextResponse.json(
			{
				error: {
					message: "Server error",
				},
			},
			{
				status: 500,
			}
		);
	}
}
