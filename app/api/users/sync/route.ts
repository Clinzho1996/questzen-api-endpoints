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
			provider: user.provider,
		});

		// Check if user already exists by firebaseUid
		let existingUser = await db
			.collection("users")
			.findOne(
				{ firebaseUid: user.userId },
				{ projection: { _id: 1, firebaseUid: 1, email: 1 } }
			);

		// If not found by firebaseUid, check by email
		if (!existingUser && user.email) {
			existingUser = await db
				.collection("users")
				.findOne(
					{ email: user.email },
					{ projection: { _id: 1, firebaseUid: 1, email: 1 } }
				);

			// If found by email but no firebaseUid, update it
			if (existingUser && !existingUser.firebaseUid) {
				await db
					.collection("users")
					.updateOne(
						{ _id: existingUser._id },
						{ $set: { firebaseUid: user.userId } }
					);
				console.log("🔗 Linked existing user to Firebase UID");
			}
		}

		if (existingUser) {
			console.log("✅ User already exists in MongoDB:", existingUser.email);

			// Update with latest info if needed
			const updates: any = {
				updatedAt: new Date(),
			};

			if (user.email && !existingUser.email) {
				updates.email = user.email;
			}

			if (Object.keys(updates).length > 1) {
				await db
					.collection("users")
					.updateOne({ _id: existingUser._id }, { $set: updates });
			}

			return NextResponse.json({
				success: true,
				user: {
					...existingUser,
					id: existingUser._id.toString(),
				},
				message: "User already exists",
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
			completedGoals: 0,
			achievements: [],
			createdAt: new Date(),
			updatedAt: new Date(),
			provider: user.provider || "google",
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
