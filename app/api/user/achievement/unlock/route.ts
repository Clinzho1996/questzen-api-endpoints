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
// Helper function to get achievement names
function getAchievementName(id: string): string {
	const names: Record<string, string> = {
		// Habit achievements
		habit_first_complete: "Baby Steps",
		habit_streak_3: "Getting Started",
		habit_streak_7: "Week Warrior",
		habit_streak_14: "Fortnight Fighter",
		habit_streak_30: "Monthly Master",
		habit_streak_90: "Quarter Queen",
		habit_complete_10: "Habit Hero",
		habit_complete_50: "Habit Champion",
		habit_complete_100: "Centurion",
		habit_complete_500: "Legend",
		habit_daily_3: "Triple Threat",
		habit_daily_5: "Quintessential",
		habit_daily_10: "Perfect Ten",
		habit_morning_routine: "Early Riser",
		habit_evening_routine: "Night Owl",
		habit_collaboration: "Team Player",

		// Focus achievements
		focus_first_session: "Focus Initiate",
		focus_beginner: "Focus Apprentice",
		focus_intermediate: "Focus Adept",
		focus_master: "Focus Master",
		focus_grandmaster: "Focus Grandmaster",
		time_minutes_100: "Time Explorer",
		time_minutes_500: "Time Adventurer",
		time_minutes_1000: "Time Lord",
		time_minutes_5000: "Time Master",
		long_focus_session: "Deep Diver",

		// Streak achievements
		streak_3: "Consistency Starter",
		streak_7: "Weekly Warrior",
		streak_14: "Bi-Weekly Badass",
		streak_30: "Monthly Maestro",
		streak_60: "Bi-Monthly Beast",
		streak_90: "Quarter Queen/King",
		streak_365: "Yearlong Yogi",

		// Collaboration achievements
		collaboration_invite: "Social Butterfly",
		collaboration_accept: "Team Member",
		collaboration_complete_5: "Power Team",
		collaboration_complete_20: "Dream Team",
		multiple_collaborators: "Community Builder",

		// Consistency achievements
		perfect_week: "Perfect Week",
		perfect_month: "Perfect Month",
		consistency_80: "Consistency King",
		consistency_90: "Consistency Master",

		// Productivity achievements
		high_productivity_day: "Power Day",
		productivity_streak_5: "Productivity Pro",
		balanced_life: "Life Balancer",

		// Special achievements
		first_of_year: "New Year, New You",
		birthday_habit: "Birthday Celebration",
		midnight_habit: "Midnight Oil",
		dawn_habit: "Early Bird",
		holiday_habit: "Dedicated",
		travel_habit: "Road Warrior",
		sick_day_habit: "Unstoppable",
		all_habits_day: "Overachiever",
	};

	return names[id] || "Achievement Unlocked";
}
