// app/api/habits/[id]/analytics/route.ts
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
	request: NextRequest,
	{ params }: { params: { id: string } }
) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();
		const habitId = params.id;

		// Get user
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

		// Create new user if not found
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

		// Get the specific habit
		const habit = await db.collection("habits").findOne({
			_id: new ObjectId(habitId),
			userId: currentUser._id,
		});

		if (!habit) {
			return NextResponse.json(
				{ error: { message: "Habit not found" } },
				{ status: 404 }
			);
		}

		// Get completions for this habit (last 90 days for better analysis)
		const ninetyDaysAgo = new Date();
		ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

		const allCompletions = await db
			.collection("habit_completions")
			.find({
				habitId: new ObjectId(habitId),
				userId: currentUser._id,
				date: { $gte: ninetyDaysAgo.toISOString().split("T")[0] },
			})
			.sort({ date: 1 })
			.toArray();

		// Get completions for the last 30 days for recent trends
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

		const recentCompletions = allCompletions.filter(
			(comp) => new Date(comp.date) >= thirtyDaysAgo
		);

		// Calculate analytics for this habit
		const analytics = {
			habitId: habit._id.toString(),
			name: habit.name,
			stats: habit.stats || {},
			completionsLast30Days: recentCompletions.filter((c) => c.completed)
				.length,
			streakHistory: calculateStreakHistory(allCompletions),
			weeklyAverage: calculateWeeklyAverage(allCompletions),
			mostProductiveDay: calculateMostProductiveDay(allCompletions),
			timeOfDayPattern: calculateTimeOfDayPattern(allCompletions),
			dailyTrends: calculateDailyTrends(recentCompletions),
			successRateByWeek: calculateSuccessRateByWeek(allCompletions),
			timeSpentAnalysis: calculateTimeSpentAnalysis(allCompletions),
			moodProductivity: calculateMoodProductivity(allCompletions),
			completionHistory: formatCompletionHistory(allCompletions),
		};

		return NextResponse.json(analytics);
	} catch (error: any) {
		console.error("Get habit analytics error:", error);
		return NextResponse.json(
			{ error: { message: "Failed to fetch habit analytics" } },
			{ status: 500 }
		);
	}
}

// Helper function to calculate streak history
function calculateStreakHistory(completions: any[]) {
	if (completions.length === 0) {
		return {
			currentStreak: 0,
			bestStreak: 0,
			streakDays: [],
		};
	}

	const sortedCompletions = [...completions].sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
	);

	let currentStreak = 0;
	let bestStreak = 0;
	let streakDays: string[] = [];
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	// Check consecutive days from today backwards
	for (let i = 0; i <= 90; i++) {
		const checkDate = new Date(today);
		checkDate.setDate(checkDate.getDate() - i);
		const dateStr = checkDate.toISOString().split("T")[0];

		const completion = sortedCompletions.find((c) => c.date === dateStr);
		const isCompleted = completion?.completed === true;

		if (isCompleted) {
			currentStreak++;
			streakDays.push(dateStr);
		} else {
			// Only break if we've started counting and hit a non-completed day
			if (currentStreak > 0) {
				break;
			}
		}
	}

	// Calculate best streak
	let tempStreak = 0;
	bestStreak = 0;

	sortedCompletions.forEach((completion, index) => {
		if (completion.completed) {
			tempStreak++;
			bestStreak = Math.max(bestStreak, tempStreak);
		} else {
			tempStreak = 0;
		}
	});

	return {
		currentStreak,
		bestStreak,
		streakDays,
		totalDaysTracked: sortedCompletions.length,
	};
}

// Calculate weekly average completions
function calculateWeeklyAverage(completions: any[]) {
	if (completions.length === 0) return 0;

	const completed = completions.filter((c) => c.completed);

	// Group by week
	const weeks = new Map<string, number>();

	completed.forEach((comp) => {
		const date = new Date(comp.date);
		const year = date.getFullYear();
		const weekNumber = getWeekNumber(date);
		const weekKey = `${year}-W${weekNumber}`;

		weeks.set(weekKey, (weeks.get(weekKey) || 0) + 1);
	});

	if (weeks.size === 0) return 0;

	const totalCompletions = Array.from(weeks.values()).reduce(
		(a, b) => a + b,
		0
	);
	return totalCompletions / weeks.size;
}

// Helper to get week number
function getWeekNumber(date: Date): number {
	const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
	const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
	return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Calculate most productive day of the week
function calculateMostProductiveDay(completions: any[]) {
	if (completions.length === 0) return "No data";

	const completed = completions.filter((c) => c.completed);

	const dayCounts: Record<string, number> = {
		Sunday: 0,
		Monday: 0,
		Tuesday: 0,
		Wednesday: 0,
		Thursday: 0,
		Friday: 0,
		Saturday: 0,
	};

	completed.forEach((comp) => {
		const date = new Date(comp.date);
		const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
		dayCounts[dayName]++;
	});

	const mostProductive = Object.entries(dayCounts).reduce(
		(max, [day, count]) => (count > max[1] ? [day, count] : max),
		["", 0]
	);

	return mostProductive[0];
}

// Calculate time of day pattern
function calculateTimeOfDayPattern(completions: any[]) {
	const completed = completions.filter((c) => c.completed && c.timeSpent);

	if (completed.length === 0) {
		return {
			bestTime: "No data",
			averageTimeSpent: 0,
			totalTimeSpent: 0,
		};
	}

	// Group by hour if timestamp is available
	const hourCounts: Record<number, number> = {};
	let totalTimeSpent = 0;

	completed.forEach((comp) => {
		totalTimeSpent += comp.timeSpent || 0;

		// If we have a timestamp, analyze hour of completion
		if (comp.createdAt) {
			const hour = new Date(comp.createdAt).getHours();
			hourCounts[hour] = (hourCounts[hour] || 0) + 1;
		}
	});

	// Find best hour
	let bestHour = -1;
	let maxCount = 0;

	Object.entries(hourCounts).forEach(([hour, count]) => {
		if (count > maxCount) {
			maxCount = count;
			bestHour = parseInt(hour);
		}
	});

	let bestTime = "No data";
	if (bestHour !== -1) {
		if (bestHour < 12) bestTime = `Morning (${bestHour}:00 AM)`;
		else if (bestHour < 17) bestTime = `Afternoon (${bestHour}:00 PM)`;
		else bestTime = `Evening (${bestHour}:00 PM)`;
	}

	return {
		bestTime,
		averageTimeSpent: totalTimeSpent / completed.length,
		totalTimeSpent,
		completionsByHour: hourCounts,
	};
}

// Calculate daily trends for the last 30 days
function calculateDailyTrends(completions: any[]) {
	const dailyTrends: Array<{
		date: string;
		completed: boolean;
		count?: number;
		timeSpent?: number;
	}> = [];
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

	for (let i = 30; i >= 0; i--) {
		const date = new Date();
		date.setDate(date.getDate() - i);
		const dateStr = date.toISOString().split("T")[0];

		const dayCompletions = completions.filter((c) => c.date === dateStr);
		const completed = dayCompletions.some((c) => c.completed);
		const count = dayCompletions.filter((c) => c.completed).length;
		const timeSpent = dayCompletions.reduce(
			(sum, c) => sum + (c.timeSpent || 0),
			0
		);

		dailyTrends.push({
			date: dateStr,
			completed,
			count,
			timeSpent,
		});
	}

	return dailyTrends;
}

// Calculate success rate by week
function calculateSuccessRateByWeek(completions: any[]) {
	const weeklyRates: Array<{
		week: string;
		successRate: number;
		totalDays: number;
		completedDays: number;
	}> = [];

	// Group by week
	const weeks = new Map<string, { total: number; completed: number }>();

	completions.forEach((comp) => {
		const date = new Date(comp.date);
		const year = date.getFullYear();
		const weekNumber = getWeekNumber(date);
		const weekKey = `${year}-W${weekNumber}`;

		const weekData = weeks.get(weekKey) || { total: 0, completed: 0 };
		weekData.total++;
		if (comp.completed) weekData.completed++;
		weeks.set(weekKey, weekData);
	});

	// Convert to array and calculate rates
	Array.from(weeks.entries()).forEach(([week, data]) => {
		weeklyRates.push({
			week,
			successRate: (data.completed / data.total) * 100,
			totalDays: data.total,
			completedDays: data.completed,
		});
	});

	// Sort by week
	weeklyRates.sort((a, b) => a.week.localeCompare(b.week));

	return weeklyRates;
}

// Calculate time spent analysis
function calculateTimeSpentAnalysis(completions: any[]) {
	const completedWithTime = completions.filter(
		(c) => c.completed && c.timeSpent
	);

	if (completedWithTime.length === 0) {
		return {
			averageTimeSpent: 0,
			totalTimeSpent: 0,
			minTimeSpent: 0,
			maxTimeSpent: 0,
			timeDistribution: [],
		};
	}

	const times = completedWithTime.map((c) => c.timeSpent);
	const totalTimeSpent = times.reduce((a, b) => a + b, 0);
	const averageTimeSpent = totalTimeSpent / times.length;
	const minTimeSpent = Math.min(...times);
	const maxTimeSpent = Math.max(...times);

	// Create time distribution (buckets)
	const timeDistribution = [
		{ range: "0-5 min", count: times.filter((t) => t <= 5).length },
		{ range: "6-15 min", count: times.filter((t) => t > 5 && t <= 15).length },
		{
			range: "16-30 min",
			count: times.filter((t) => t > 15 && t <= 30).length,
		},
		{
			range: "31-60 min",
			count: times.filter((t) => t > 30 && t <= 60).length,
		},
		{ range: "60+ min", count: times.filter((t) => t > 60).length },
	];

	return {
		averageTimeSpent,
		totalTimeSpent,
		minTimeSpent,
		maxTimeSpent,
		timeDistribution,
	};
}

// Calculate mood and productivity statistics
function calculateMoodProductivity(completions: any[]) {
	const withMood = completions.filter(
		(c) => c.mood !== undefined && c.mood !== null
	);
	const withProductivity = completions.filter(
		(c) => c.productivity !== undefined && c.productivity !== null
	);

	if (withMood.length === 0 && withProductivity.length === 0) {
		return {
			averageMood: 0,
			averageProductivity: 0,
			moodTrend: [],
			productivityTrend: [],
		};
	}

	const averageMood =
		withMood.length > 0
			? withMood.reduce((sum, c) => sum + c.mood, 0) / withMood.length
			: 0;

	const averageProductivity =
		withProductivity.length > 0
			? withProductivity.reduce((sum, c) => sum + c.productivity, 0) /
			  withProductivity.length
			: 0;

	// Create trends (last 14 days)
	const moodTrend: Array<{ date: string; mood: number }> = [];
	const productivityTrend: Array<{ date: string; productivity: number }> = [];

	const fourteenDaysAgo = new Date();
	fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

	for (let i = 14; i >= 0; i--) {
		const date = new Date();
		date.setDate(date.getDate() - i);
		const dateStr = date.toISOString().split("T")[0];

		const dayCompletions = completions.filter((c) => c.date === dateStr);

		if (dayCompletions.length > 0) {
			const moods = dayCompletions.filter(
				(c) => c.mood !== undefined && c.mood !== null
			);
			const productivities = dayCompletions.filter(
				(c) => c.productivity !== undefined && c.productivity !== null
			);

			if (moods.length > 0) {
				const avgMood =
					moods.reduce((sum, c) => sum + c.mood, 0) / moods.length;
				moodTrend.push({ date: dateStr, mood: avgMood });
			}

			if (productivities.length > 0) {
				const avgProductivity =
					productivities.reduce((sum, c) => sum + c.productivity, 0) /
					productivities.length;
				productivityTrend.push({
					date: dateStr,
					productivity: avgProductivity,
				});
			}
		}
	}

	return {
		averageMood,
		averageProductivity,
		moodTrend,
		productivityTrend,
		totalMoodEntries: withMood.length,
		totalProductivityEntries: withProductivity.length,
	};
}

// Format completion history for frontend
function formatCompletionHistory(completions: any[]) {
	return completions
		.filter((c) => c.completed)
		.map((comp) => ({
			date: comp.date,
			completed: comp.completed,
			timeSpent: comp.timeSpent || 0,
			mood: comp.mood,
			productivity: comp.productivity,
			notes: comp.notes,
			createdAt: comp.createdAt,
		}))
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
