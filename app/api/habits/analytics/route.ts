// app/api/habits/analytics/route.ts
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
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

		// Get all user habits with completions
		const habits = await db
			.collection("habits")
			.find({
				userId: currentUser._id,
				isPredefined: false,
			})
			.toArray();

		const habitIds = habits.map((h) => h._id);

		// Get completions for the last 30 days
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

		const completions = await db
			.collection("habit_completions")
			.find({
				habitId: { $in: habitIds },
				userId: currentUser._id,
				date: { $gte: thirtyDaysAgo.toISOString().split("T")[0] },
			})
			.toArray();

		// Calculate analytics
		const analytics = {
			overview: {
				totalHabits: habits.length,
				activeHabits: habits.filter((h) => h.stats.currentStreak > 0).length,
				totalCompletions: habits.reduce(
					(sum, h) => sum + (h.stats.totalCompletions || 0),
					0
				),
				totalMinutesSpent: habits.reduce(
					(sum, h) => sum + (h.stats.totalMinutesSpent || 0),
					0
				),
				averageSuccessRate:
					habits.length > 0
						? habits.reduce((sum, h) => sum + (h.stats.successRate || 0), 0) /
						  habits.length
						: 0,
			},
			streaks: {
				bestStreak: Math.max(...habits.map((h) => h.stats.bestStreak || 0)),
				currentStreaks: habits
					.map((h) => ({
						name: h.name,
						streak: h.stats.currentStreak || 0,
						icon: h.icon,
					}))
					.sort((a, b) => b.streak - a.streak),
			},
			categories: {
				morning: habits.filter((h) => h.category === "morning_routine").length,
				afternoon: habits.filter((h) => h.category === "afternoon_routine")
					.length,
				evening: habits.filter((h) => h.category === "evening_routine").length,
				any: habits.filter((h) => h.category === "any_time").length,
			},
			trends: calculateTrends(completions),
			recommendations: generateRecommendations(habits, completions),
		};

		return NextResponse.json(analytics);
	} catch (error: any) {
		console.error("Get analytics error:", error);
		return NextResponse.json(
			{ error: { message: "Failed to fetch analytics" } },
			{ status: 500 }
		);
	}
}

function calculateTrends(completions: any[]) {
	// Calculate daily completion trends
	const dailyTrends: Record<string, number> = {};

	completions.forEach((comp) => {
		if (comp.completed) {
			dailyTrends[comp.date] = (dailyTrends[comp.date] || 0) + 1;
		}
	});

	return {
		daily: Object.entries(dailyTrends).map(([date, count]) => ({
			date,
			count,
		})),
		weeklyAverage: Object.values(dailyTrends).reduce((a, b) => a + b, 0) / 7,
		bestDay: Object.entries(dailyTrends).reduce(
			(a, b) => (a[1] > b[1] ? a : b),
			["", 0]
		)[0],
	};
}

function generateRecommendations(habits: any[], completions: any[]): string[] {
	const recommendations = [];

	// Check for low success rate habits
	habits.forEach((habit) => {
		if (habit.stats.successRate < 40) {
			recommendations.push(
				`Consider adjusting your "${
					habit.name
				}" routine. Your success rate is ${habit.stats.successRate.toFixed(
					1
				)}%.`
			);
		}
	});

	// Check for time of day patterns
	const morningHabits = habits.filter((h) =>
		h.settings.timeOfDay?.includes("morning")
	);

	if (morningHabits.length === 0) {
		recommendations.push(
			"Consider adding a morning routine to start your day productively."
		);
	}

	// Check for consistency
	const consistentHabits = habits.filter((h) => h.stats.currentStreak >= 7);
	if (consistentHabits.length >= 3) {
		recommendations.push(
			`Great job! You have ${consistentHabits.length} habits with 7+ day streaks. Keep up the momentum!`
		);
	}

	return recommendations;
}
