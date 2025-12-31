// app/api/habits/[id]/complete/route.ts
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const user = await requireAuth(request);
		const params = await context.params;
		const habitId = params.id;
		const { date, mood, productivity, notes, timeSpent } = await request.json();

		const db = await getDatabase();

		// Get current user
		let currentUser = null;
		if (user.userId && /^[0-9a-fA-F]{24}$/.test(user.userId)) {
			try {
				currentUser = await db.collection("users").findOne(
					{ _id: new ObjectId(user.userId) },
					{
						projection: {
							_id: 1,
							firebaseUid: 1,
							email: 1,
							displayName: 1,
							photoURL: 1,
						},
					}
				);
				console.log("✅ Found user by MongoDB _id");
			} catch (error) {
				console.log("⚠️ Invalid ObjectId format for user lookup");
			}
		}

		// Priority 2: Look by firebaseUid
		if (!currentUser && user.userId) {
			currentUser = await db.collection("users").findOne(
				{ firebaseUid: user.userId },
				{
					projection: {
						_id: 1,
						firebaseUid: 1,
						email: 1,
						displayName: 1,
						photoURL: 1,
					},
				}
			);
			console.log("✅ Found user by firebaseUid");
		}

		// Priority 3: Look by email
		if (!currentUser && user.email) {
			currentUser = await db.collection("users").findOne(
				{ email: user.email.toLowerCase().trim() },
				{
					projection: {
						_id: 1,
						firebaseUid: 1,
						email: 1,
						displayName: 1,
						photoURL: 1,
					},
				}
			);
			console.log("✅ Found user by email");
		}

		if (!currentUser) {
			console.log("🔄 Creating new user...");
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
			};

			const result = await db.collection("users").insertOne(newUser);
			currentUser = {
				_id: result.insertedId,
				firebaseUid: newUser.firebaseUid,
				email: newUser.email,
				displayName: newUser.displayName,
				photoURL: "",
			};
			console.log("✅ Created new user");
		}

		// Get ALL possible identifiers for this user
		const userFirebaseUid = currentUser.firebaseUid || user.userId;
		const userMongoId = currentUser._id;
		const userMongoIdString = userMongoId.toString();
		const userEmail = currentUser.email;
		const userDisplayName =
			currentUser.displayName || userEmail?.split("@")[0] || "User";

		console.log("👤 Current user identifiers:", {
			firebaseUid: userFirebaseUid,
			mongoId: userMongoIdString,
			email: userEmail,
			displayName: userDisplayName,
		});

		if (!currentUser) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		const targetDate = date || new Date().toISOString().split("T")[0];

		const completionResult = await db
			.collection("habit_completions")
			.findOneAndUpdate(
				{
					habitId: new ObjectId(habitId),
					$or: [
						{ userId: currentUser._id },
						{ userFirebaseUid: currentUser.firebaseUid },
					],
					date: targetDate,
				},
				{
					$set: {
						completed: true,
						mood: mood || null,
						productivity: productivity || null,
						notes: notes || "",
						timeSpent: timeSpent || 0,
						completedAt: new Date(),
						updatedAt: new Date(),
					},
					$inc: {
						count: 1,
					},
					$setOnInsert: {
						createdAt: new Date(),
						userId: currentUser._id,
						userFirebaseUid: currentUser.firebaseUid || undefined,
						habitId: new ObjectId(habitId),
						date: targetDate,
					},
				},
				{
					upsert: true,
					returnDocument: "after",
				}
			);

		// Handle null completion
		if (!completionResult || !completionResult.value) {
			console.error("Failed to create or update completion record");
			return NextResponse.json(
				{ error: { message: "Failed to record habit completion" } },
				{ status: 500 }
			);
		}

		const completion = completionResult.value;

		// Then in your response:
		return NextResponse.json({
			success: true,
			completion: completion, // This is now guaranteed to not be null
			xpEarned: 10,
		});
	} catch (error: any) {
		console.error("Complete habit error:", error);
		return NextResponse.json(
			{ error: { message: "Failed to complete habit" } },
			{ status: 500 }
		);
	}
}
