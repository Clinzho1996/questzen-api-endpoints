// app/api/user/stats/update/route.ts - FIXED VERSION
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

// Handle OPTIONS for CORS
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
			action,
		} = body;

		const db = await getDatabase();

		console.log("📊 Update stats request:", {
			userId: user.userId,
			email: user.email,
			xpChange,
			completedChange,
			action,
			goalId,
		});

		// Find user by MULTIPLE methods (just like in your other routes)
		let userData = null;

		// Try as MongoDB ObjectId first (from custom JWT)
		if (user.userId && user.userId.length === 24) {
			try {
				userData = await db.collection("users").findOne(
					{ _id: new ObjectId(user.userId) },
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
							firebaseUid: 1,
							email: 1,
						},
					}
				);
			} catch (error) {
				console.log("Not a valid ObjectId:", user.userId);
			}
		}

		// Try as firebaseUid if not found
		if (!userData && user.userId) {
			userData = await db.collection("users").findOne(
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
						firebaseUid: 1,
						email: 1,
					},
				}
			);
		}

		// Try by email as last resort
		if (!userData && user.email) {
			userData = await db.collection("users").findOne(
				{ email: user.email.toLowerCase().trim() },
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
						firebaseUid: 1,
						email: 1,
					},
				}
			);
		}

		if (!userData) {
			console.error("❌ User not found with any method:", {
				userId: user.userId,
				email: user.email,
			});
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		console.log("👤 Found user:", {
			_id: userData._id,
			email: userData.email,
			currentXP: userData.xp || 0,
			currentLevel: userData.level || 1,
			currentCompleted: userData.completedGoals || 0,
		});

		// Calculate new values
		const currentXP = userData.xp || 0;
		const currentCompletedGoals = userData.completedGoals || 0;
		const currentLevel = userData.level || 1;

		const newXP = currentXP + xpChange;
		const newCompletedGoals = currentCompletedGoals + completedChange;
		const newLevel = Math.floor(newXP / 1000) + 1;

		console.log("🔢 Level calculation:", {
			currentXP: currentXP,
			currentLevel: currentLevel,
			xpChange: xpChange,
			newXP: newXP,
			calculatedLevel: newLevel,
			formula: `Math.floor(${newXP} / 1000) + 1 = ${
				Math.floor(newXP / 1000) + 1
			}`,
		});
		// Prepare update data
		const updateData: any = {
			updatedAt: new Date(),
			xp: newXP,
			completedGoals: newCompletedGoals,
			level: newLevel,
		};

		// Check if level should change
		const shouldLevelUp = newLevel > currentLevel;
		console.log("🎯 Level up check:", {
			shouldLevelUp: shouldLevelUp,
			newLevel: newLevel,
			currentLevel: currentLevel,
		});
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

		console.log("📝 Updating user with:", updateData);

		// Update user in database - use the found user's _id
		const result = await db
			.collection("users")
			.updateOne({ _id: userData._id }, { $set: updateData });

		console.log("✅ Update result:", {
			matchedCount: result.matchedCount,
			modifiedCount: result.modifiedCount,
		});

		if (result.modifiedCount === 0) {
			console.warn("⚠️ User stats were not modified (possibly same values)");
		}

		// Also update the goal completion status in goals collection if goalId provided
		if (goalId && completedChange !== 0) {
			try {
				const completedStatus = completedChange > 0;
				console.log("🎯 Updating goal completion:", {
					goalId,
					completedStatus,
				});

				await db.collection("goals").updateOne(
					{ _id: new ObjectId(goalId) },
					{
						$set: {
							completed: completedStatus,
							progress: completedStatus ? 100 : 0,
							updatedAt: new Date(),
							...(completedStatus && { completedAt: new Date() }),
						},
					}
				);
			} catch (error) {
				console.error("❌ Error updating goal:", error);
				// Don't fail the whole request if goal update fails
			}
		}

		// Get updated user data
		const updatedUser = await db.collection("users").findOne(
			{ _id: userData._id },
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
			xpChange,
			completedChange,
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
		console.error("❌ Update user stats error:", error);

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
