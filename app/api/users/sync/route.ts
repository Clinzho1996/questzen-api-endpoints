import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		console.log("🔄 Syncing user to MongoDB:", {
			userId: user.userId,
			email: user.email,
		});

		// Check if user already exists
		const existingUser = await db
			.collection("users")
			.findOne(
				{ firebaseUid: user.userId },
				{ projection: { _id: 1, firebaseUid: 1, email: 1 } }
			);

		if (existingUser) {
			console.log("✅ User already exists in MongoDB");
			return NextResponse.json({
				success: true,
				user: {
					...existingUser,
					id: existingUser._id.toString(),
				},
				message: "User already synced",
			});
		}

		// Create new user in MongoDB
		const newUser = {
			firebaseUid: user.userId,
			email: user.email || "",
			displayName: user.email?.split("@")[0] || "QuestZen User",
			photoURL: "",
			subscriptionTier: "free",
			streak: 0,
			longestStreak: 0,
			totalFocusMinutes: 0,
			level: 1,
			xp: 0,
			achievements: [],
			createdAt: new Date(),
			updatedAt: new Date(),
			provider: user.provider || "google", // Track auth provider
		};

		const result = await db.collection("users").insertOne(newUser);

		const createdUser = {
			...newUser,
			id: result.insertedId.toString(),
			_id: result.insertedId,
		};

		console.log("✅ Created user in MongoDB:", createdUser.email);

		return NextResponse.json({
			success: true,
			user: createdUser,
			message: "User synced successfully",
		});
	} catch (error: any) {
		console.error("❌ Sync user error:", error);
		return NextResponse.json(
			{
				error: {
					message: "Failed to sync user",
					details: error.message,
				},
			},
			{ status: 500 }
		);
	}
}
