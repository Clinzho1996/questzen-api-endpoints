// app/api/auth/check-user-status/route.ts
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { uid, email } = body;

		if (!uid && !email) {
			return NextResponse.json(
				{ error: "Missing UID or email" },
				{ status: 400 }
			);
		}

		const db = await getDatabase();
		const usersCollection = db.collection("users");

		// Find user by UID or email
		const query: any = {};
		if (uid) query.firebaseUid = uid;
		if (email) query.email = email.toLowerCase();

		const user = await usersCollection.findOne(query);

		if (!user) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Check if user is deleted
		if (user.deletedAt || user.isDeleted) {
			return NextResponse.json(
				{
					error: "Account has been deleted",
					deletedAt: user.deletedAt,
				},
				{ status: 410 }
			);
		}

		return NextResponse.json({
			exists: true,
			user: {
				_id: user._id,
				email: user.email,
				displayName: user.displayName,
				subscriptionTier: user.subscriptionTier,
				deletedAt: user.deletedAt || null,
				isDeleted: user.isDeleted || false,
			},
		});
	} catch (error: any) {
		console.error("Check user status error:", error);
		return NextResponse.json(
			{ error: "Failed to check user status" },
			{ status: 500 }
		);
	}
}
