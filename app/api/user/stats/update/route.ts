import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

// Handle OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
	const origin = request.headers.get("origin") || "http://localhost:5173";
	const allowedOrigins = [
		"https://questzenai.devclinton.org",
		"http://localhost:5173",
		"http://localhost:3000",
	];

	const response = new NextResponse(null, { status: 200 });

	if (allowedOrigins.includes(origin)) {
		response.headers.set("Access-Control-Allow-Origin", origin);
	}
	response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
	response.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization"
	);
	response.headers.set("Access-Control-Allow-Credentials", "true");
	response.headers.set("Access-Control-Max-Age", "86400");
	response.headers.set("Cache-Control", "no-store, max-age=0");

	return response;
}

export async function POST(request: NextRequest) {
	try {
		// Authenticate user
		const user = await requireAuth(request);

		// Parse request body
		const body = await request.json();
		const {
			xpChange = 0,
			completedChange = 0,
			goalId,
			focusSessionsChange = 0,
			totalMinutesChange = 0,
			achievementId,
		} = body;

		const db = await getDatabase();

		// Find user by firebaseUid (which should match user.userId from JWT)
		const userData = await db.collection("users").findOne(
			{ firebaseUid: user.userId },
			{
				projection: { _id: 1, xp: 1, level: 1, completedGoals: 1, streak: 1 },
			}
		);

		if (!userData) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		// Calculate new values
		const currentXP = userData.xp || 0;
		const currentCompletedGoals = userData.completedGoals || 0;
		const currentLevel = userData.level || 1;

		const newXP = currentXP + xpChange;
		const newCompletedGoals = currentCompletedGoals + completedChange;
		const newLevel = Math.floor(newXP / 1000) + 1;

		// Prepare update data
		const updateData: any = {
			updatedAt: new Date(),
			xp: newXP,
			completedGoals: newCompletedGoals,
			level: newLevel,
		};

		// Add optional fields if provided
		if (focusSessionsChange !== 0) {
			updateData.focusSessions =
				(userData.focusSessions || 0) + focusSessionsChange;
		}

		if (totalMinutesChange !== 0) {
			updateData.totalFocusMinutes =
				(userData.totalFocusMinutes || 0) + totalMinutesChange;
		}

		// Handle achievement unlocking
		if (achievementId) {
			const currentAchievements = userData.achievements || [];
			if (!currentAchievements.includes(achievementId)) {
				updateData.achievements = [...currentAchievements, achievementId];
				updateData.xp = newXP + 100; // Add bonus XP for achievement
			}
		}

		// Update user in database
		const result = await db
			.collection("users")
			.updateOne({ firebaseUid: user.userId }, { $set: updateData });

		if (result.modifiedCount === 0) {
			console.warn("User stats were not modified (possibly same values)");
		}

		// Also update the goal completion status in goals collection if goalId provided
		if (goalId && completedChange !== 0) {
			const completedStatus = completedChange > 0;

			await db.collection("goals").updateOne(
				{ _id: goalId },
				{
					$set: {
						completed: completedStatus,
						progress: completedStatus ? 100 : 0,
						updatedAt: new Date(),
					},
				}
			);
		}

		// Return updated user stats
		const updatedUser = await db.collection("users").findOne(
			{ firebaseUid: user.userId },
			{
				projection: {
					_id: 1,
					xp: 1,
					level: 1,
					completedGoals: 1,
					streak: 1,
					focusSessions: 1,
					totalFocusMinutes: 1,
					achievements: 1,
				},
			}
		);

		const response = NextResponse.json({
			success: true,
			stats: {
				id: updatedUser!._id.toString(),
				xp: updatedUser!.xp || 0,
				level: updatedUser!.level || 1,
				completedGoals: updatedUser!.completedGoals || 0,
				streak: updatedUser!.streak || 0,
				focusSessions: updatedUser!.focusSessions || 0,
				totalFocusMinutes: updatedUser!.totalFocusMinutes || 0,
				achievements: updatedUser!.achievements || [],
			},
			levelUp:
				newLevel > currentLevel
					? {
							from: currentLevel,
							to: newLevel,
					  }
					: null,
		});

		// Add CORS headers
		const origin = request.headers.get("origin") || "";
		const allowedOrigins = [
			"https://questzenai.devclinton.org",
			"http://localhost:5173",
			"http://localhost:3000",
		];

		if (allowedOrigins.includes(origin)) {
			response.headers.set("Access-Control-Allow-Origin", origin);
		}
		response.headers.set("Access-Control-Allow-Credentials", "true");

		return response;
	} catch (error: any) {
		console.error("Update user stats error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized access" } },
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{ error: { message: "Server error", details: error.message } },
			{ status: 500 }
		);
	}
}
