// app/api/users/sync/route.ts - Special endpoint for Firebase users
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const authHeader = request.headers.get("authorization");

		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return NextResponse.json(
				{ error: { message: "No token provided" } },
				{ status: 401 }
			);
		}

		const firebaseToken = authHeader.substring(7);

		// Simple Firebase token verification (decode only, not verify)
		// For production, use Firebase Admin SDK
		const jwt = require("jsonwebtoken");
		const decoded = jwt.decode(firebaseToken, { complete: true });

		if (!decoded) {
			return NextResponse.json(
				{ error: { message: "Invalid Firebase token" } },
				{ status: 401 }
			);
		}

		const firebaseUid = decoded.payload.sub || decoded.payload.user_id;
		const email = decoded.payload.email;
		const provider = decoded.payload.firebase?.sign_in_provider || "google.com";

		console.log("🔄 Syncing Firebase user:", {
			firebaseUid,
			email,
			provider,
		});

		const db = await getDatabase();

		// Check if user already exists
		let existingUser = await db
			.collection("users")
			.findOne(
				{ firebaseUid },
				{ projection: { _id: 1, firebaseUid: 1, email: 1 } }
			);

		// If not found by firebaseUid, check by email
		if (!existingUser && email) {
			existingUser = await db
				.collection("users")
				.findOne(
					{ email },
					{ projection: { _id: 1, firebaseUid: 1, email: 1 } }
				);

			// If found by email but no firebaseUid, update it
			if (existingUser && !existingUser.firebaseUid) {
				await db
					.collection("users")
					.updateOne({ _id: existingUser._id }, { $set: { firebaseUid } });
				console.log("🔗 Linked existing user to Firebase UID");
			}
		}

		if (existingUser) {
			console.log("✅ User already exists in MongoDB:", existingUser.email);

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
			firebaseUid,
			email: email || "",
			displayName: email?.split("@")[0] || "QuestZen User",
			photoURL: decoded.payload.picture || "",
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
			provider,
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
