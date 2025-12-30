// app/api/user/achievements/unlock/route.ts - FIXED VERSION
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function OPTIONS(request: NextRequest) {
	const origin = request.headers.get("origin") || "http://localhost:5173";
	const allowedOrigins = [
		"https://questzenai.devclinton.org",
		"https://questzen.app",
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
		const user = await requireAuth(request);
		const body = await request.json();
		const { achievementId } = body;

		if (!achievementId) {
			return NextResponse.json(
				{ error: { message: "achievementId is required" } },
				{ status: 400 }
			);
		}

		console.log("🏆 Unlock achievement request:", {
			userId: user.userId,
			email: user.email,
			achievementId,
		});

		const db = await getDatabase();

		// Find user by MULTIPLE methods (same as other routes)
		let userData = null;

		// Try as MongoDB ObjectId first (from custom JWT)
		if (user.userId && user.userId.length === 24) {
			try {
				userData = await db
					.collection("users")
					.findOne(
						{ _id: new ObjectId(user.userId) },
						{ projection: { achievements: 1, xp: 1, email: 1, _id: 1 } }
					);
			} catch (error) {
				console.log("Not a valid ObjectId:", user.userId);
			}
		}

		// Try as firebaseUid if not found
		if (!userData && user.userId) {
			userData = await db
				.collection("users")
				.findOne(
					{ firebaseUid: user.userId },
					{ projection: { achievements: 1, xp: 1, email: 1, _id: 1 } }
				);
		}

		// Try by email as last resort
		if (!userData && user.email) {
			userData = await db
				.collection("users")
				.findOne(
					{ email: user.email.toLowerCase().trim() },
					{ projection: { achievements: 1, xp: 1, email: 1, _id: 1 } }
				);
		}

		if (!userData) {
			console.error("❌ User not found for achievement unlock:", {
				userId: user.userId,
				email: user.email,
			});
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		console.log("👤 Found user for achievement:", {
			_id: userData._id,
			email: userData.email,
			currentAchievements: userData.achievements || [],
			currentXP: userData.xp || 0,
		});

		const currentAchievements = userData.achievements || [];

		// Check if achievement already unlocked
		if (currentAchievements.includes(achievementId)) {
			console.log("✅ Achievement already unlocked:", achievementId);
			return NextResponse.json({
				success: true,
				message: "Achievement already unlocked",
				alreadyUnlocked: true,
			});
		}

		// Update user with new achievement and bonus XP - use userData._id
		const result = await db.collection("users").updateOne(
			{ _id: userData._id },
			{
				$set: {
					updatedAt: new Date(),
				},
				$push: { achievements: achievementId },
				$inc: { xp: 100 },
			}
		);

		console.log("✅ Achievement unlock update result:", {
			matchedCount: result.matchedCount,
			modifiedCount: result.modifiedCount,
		});

		// Get updated user data
		const updatedUser = await db
			.collection("users")
			.findOne(
				{ _id: userData._id },
				{ projection: { achievements: 1, xp: 1 } }
			);

		// Get achievement name for response
		const achievementName = getAchievementName(achievementId);

		console.log("🎉 Achievement unlocked successfully:", {
			achievementId,
			achievementName,
			newXP: updatedUser!.xp,
			totalAchievements: updatedUser!.achievements?.length || 0,
		});

		const response = NextResponse.json({
			success: true,
			achievement: {
				id: achievementId,
				name: achievementName,
				xpReward: 100,
			},
			user: {
				xp: updatedUser!.xp,
				achievements: updatedUser!.achievements,
			},
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
		console.error("❌ Unlock achievement error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{ error: { message: "Server error", details: error.message } },
			{ status: 500 }
		);
	}
}

// Helper function to get achievement names
function getAchievementName(id: string): string {
	const names: Record<string, string> = {
		first_quest: "First Quest Complete",
		quest_master: "Quest Master - 10 Quests",
		century: "Century - 100 Quests",
		focus_beginner: "Focus Beginner - 5 Sessions",
		focus_master: "Focus Master - 50 Sessions",
		time_lord: "Time Lord - 1000 Minutes",
		early_bird: "Early Bird",
		night_owl: "Night Owl",
		streak_warrior: "7-Day Streak",
		streak_legend: "30-Day Streak",
		first_goal_completed: "First Goal Completed",
		goal_master: "Goal Master",
		focus_champion: "Focus Champion",
	};
	return names[id] || "Achievement Unlocked";
}
