import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

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
					paystackCustomerCode: 1,
					subscriptionStatus: 1,
					paystackSubscriptionCode: 1,
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
			tier: userData.subscriptionTier || "free",
			stripeCustomerId: userData.stripeCustomerId || null,
			subscriptionStatus: userData.subscriptionStatus || "inactive",
		});
	} catch (error: any) {
		if (error.message === "Unauthorized") {
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
