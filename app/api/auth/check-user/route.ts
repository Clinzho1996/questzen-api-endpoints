// app/api/auth/check-user/route.ts
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { uid } = body;

		if (!uid) {
			return NextResponse.json({ error: "Missing UID" }, { status: 400 });
		}

		// Check MongoDB for user status
		const db = await getDatabase();
		const user = await db.collection("users").findOne({
			firebaseUid: uid,
		});

		if (!user) {
			// User doesn't exist in our database
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Check if user is deleted
		if (user.deletedAt) {
			return NextResponse.json(
				{ error: "Account has been deleted" },
				{ status: 410 }
			);
		}

		return NextResponse.json({
			exists: true,
			user: {
				_id: user._id,
				email: user.email,
				subscriptionTier: user.subscriptionTier,
				deletedAt: user.deletedAt || null,
			},
		});
	} catch (error: any) {
		console.error("Check user error:", error);
		return NextResponse.json(
			{ error: "Failed to check user status" },
			{ status: 500 }
		);
	}
}
