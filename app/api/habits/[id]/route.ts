// app/api/habits/[id]/route.ts
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

interface Habit {
	_id: ObjectId;
	userId: ObjectId;
	userFirebaseUid?: string;
	name: string;
	description: string;
	category: string;
	settings: {
		timeOfDay: string[];
		timesPerWeek: number;
		timesPerDay: number;
		reminders: string[];
		duration: number;
	};
	info: {
		description?: string;
		howTo?: string;
		benefits?: string;
		whyItWorks?: string;
		sideEffects?: string;
		tips?: string;
		supportingArticles?: string[];
	};
	stats: {
		totalCompletions: number;
		bestStreak: number;
		currentStreak: number;
		averageCompletionTime: number;
		successRate: number;
		totalMinutesSpent: number;
		completionHistory: Array<{
			date: string;
			completed: boolean;
			count: number;
			timeSpent: number;
			mood?: number;
			productivity?: number;
		}>;
	};
	notes: Array<{
		id: string;
		content: string;
		createdAt: Date;
		updatedAt: Date;
	}>;
	tags: string[];
	color: string;
	icon: string;
	isPredefined: boolean;
	isFromPredefined: boolean;
	originalHabitId?: string;
	createdAt: Date;
	updatedAt: Date;
}

// Helper function for user lookup (DRY)
async function getCurrentUser(db: any, user: any) {
	let currentUser = null;

	// Priority 1: Look by MongoDB _id if userId is MongoDB ID
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

	return currentUser;
}

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const user = await requireAuth(request);
		const params = await context.params;
		const habitId = params.id;
		const tab = request.nextUrl.searchParams.get("tab") || "settings";

		const db = await getDatabase();

		// Get current user
		const currentUser = await getCurrentUser(db, user);
		if (!currentUser) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		console.log("👤 Current user for habit detail:", {
			userId: currentUser._id,
			firebaseUid: currentUser.firebaseUid,
			email: currentUser.email,
		});

		const habit = await db.collection<Habit>("habits").findOne({
			_id: new ObjectId(habitId),
			$or: [
				{ userId: currentUser._id },
				{ userFirebaseUid: currentUser.firebaseUid },
				{ isPredefined: true },
			],
		});

		if (!habit) {
			console.log("❌ Habit not found:", habitId);
			return NextResponse.json(
				{ error: { message: "Habit not found" } },
				{ status: 404 }
			);
		}

		console.log("✅ Found habit:", {
			name: habit.name,
			userId: habit.userId,
			isPredefined: habit.isPredefined,
		});

		// Get completion data for stats
		const completions = await db
			.collection("habit_completions")
			.find({
				habitId: new ObjectId(habitId),
				$or: [
					{ userId: currentUser._id },
					{ userFirebaseUid: currentUser.firebaseUid },
				],
			})
			.sort({ date: -1 })
			.limit(100)
			.toArray();

		console.log(`📊 Found ${completions.length} completion records`);

		// Calculate stats
		const statsData = {
			totalCompletions: completions.filter((c) => c.completed).length,
			totalAttempts: completions.length,
			currentStreak: calculateCurrentStreak(completions),
			bestStreak: calculateBestStreak(completions),
			averageCompletionTime:
				completions.length > 0
					? completions.reduce((sum, c) => sum + (c.timeSpent || 0), 0) /
					  completions.length
					: 0,
			successRate:
				completions.length > 0
					? (completions.filter((c) => c.completed).length /
							completions.length) *
					  100
					: 0,
			completionHistory: completions.map((c) => ({
				date: c.date,
				completed: c.completed,
				count: c.count,
				timeSpent: c.timeSpent,
				mood: c.mood,
				productivity: c.productivity,
			})),
			weeklyTrend: calculateWeeklyTrend(completions),
			bestDay: calculateBestDay(completions),
			worstDay: calculateWorstDay(completions),
			bestTime: calculateBestTime(completions),
			moodCorrelation: calculateMoodCorrelation(completions),
			productivityImpact: calculateProductivityImpact(completions),
			consistencyScore: calculateConsistencyScore(completions),
			totalMinutesSpent: completions.reduce(
				(sum, c) => sum + (c.timeSpent || 0),
				0
			),
		};

		// Get notes
		const notes = habit.notes || [];

		// Get today's completion status
		const today = new Date().toISOString().split("T")[0];
		const todayCompletion = completions.find((c) => c.date === today);
		const completedToday = todayCompletion?.completed || false;

		// Prepare response based on tab
		let response;
		switch (tab) {
			case "settings":
				response = {
					settings: habit.settings,
					basicInfo: {
						name: habit.name,
						description: habit.description,
						category: habit.category,
						tags: habit.tags,
						color: habit.color,
						icon: habit.icon,
					},
					completedToday,
				};
				break;

			case "info":
				response = {
					info: habit.info || {
						description: habit.description,
						timeCommitment: habit.settings.duration,
						suggestedFrequency: `At least ${habit.settings.timesPerWeek} times per week`,
						improves: ["Well-being", "Productivity"],
						howTo: "Follow the routine as prescribed",
						benefits: "Improves overall quality of life",
						whyItWorks: "Consistency builds positive habits",
						sideEffects: "May lead to improved mood and productivity",
						tips: "Start small and be consistent",
						supportingArticles: [],
					},
					disclaimer:
						"The information in this app is for educational purposes only and is not medical advice. Please consult your healthcare provider before making any changes to your routine.",
				};
				break;

			case "stats":
				response = {
					stats: statsData,
					aiAnalysis: generateAIAnalysis(statsData, habit),
					insights: generateInsights(statsData, habit),
				};
				break;

			case "notes":
				response = {
					notes: notes,
					totalNotes: notes.length,
				};
				break;

			default:
				response = {
					habit: {
						...habit,
						id: habit._id.toString(),
						_id: undefined,
						completedToday,
						stats: statsData,
					},
				};
		}

		return NextResponse.json(response);
	} catch (error: any) {
		console.error("Get habit details error:", error);
		return NextResponse.json(
			{
				error: {
					message: "Failed to fetch habit details",
					details: error.message,
				},
			},
			{ status: 500 }
		);
	}
}

// PATCH - Update habit
export async function PATCH(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const user = await requireAuth(request);
		const params = await context.params;
		const habitId = params.id;
		const body = await request.json();
		const { tab, data } = body;

		const db = await getDatabase();

		// Get current user
		const currentUser = await getCurrentUser(db, user);
		if (!currentUser) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		const updateData: any = { updatedAt: new Date() };

		switch (tab) {
			case "settings":
				updateData.settings = data;
				break;
			case "info":
				updateData.info = data;
				break;
			case "basic":
				updateData.name = data.name;
				updateData.description = data.description;
				updateData.category = data.category;
				updateData.tags = data.tags;
				updateData.color = data.color;
				updateData.icon = data.icon;
				break;
			case "stats":
				// Only allow updating completion history
				if (data.completionHistory) {
					updateData["stats.completionHistory"] = data.completionHistory;
				}
				break;
			default:
				Object.assign(updateData, data);
		}

		const result = await db.collection("habits").updateOne(
			{
				_id: new ObjectId(habitId),
				$or: [
					{ userId: currentUser._id },
					{ userFirebaseUid: currentUser.firebaseUid },
				],
			},
			{ $set: updateData }
		);

		if (result.matchedCount === 0) {
			return NextResponse.json(
				{ error: { message: "Habit not found or no permission" } },
				{ status: 404 }
			);
		}

		const updatedHabit = await db.collection("habits").findOne({
			_id: new ObjectId(habitId),
		});

		if (!updatedHabit) {
			return NextResponse.json(
				{ error: { message: "Failed to retrieve updated habit" } },
				{ status: 500 }
			);
		}

		return NextResponse.json({
			...updatedHabit,
			id: updatedHabit._id.toString(),
			_id: undefined,
		});
	} catch (error: any) {
		console.error("Update habit error:", error);
		return NextResponse.json(
			{ error: { message: "Failed to update habit", details: error.message } },
			{ status: 500 }
		);
	}
}

// POST - Add note to habit
export async function POST(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const user = await requireAuth(request);
		const params = await context.params;
		const habitId = params.id;
		const { content } = await request.json();

		if (!content || content.trim() === "") {
			return NextResponse.json(
				{ error: { message: "Note content is required" } },
				{ status: 400 }
			);
		}

		const db = await getDatabase();

		// Get current user
		const currentUser = await getCurrentUser(db, user);
		if (!currentUser) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		const note = {
			id: new ObjectId().toString(),
			content: content.trim(),
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const result = await db.collection("habits").updateOne(
			{
				_id: new ObjectId(habitId),
				$or: [
					{ userId: currentUser._id },
					{ userFirebaseUid: currentUser.firebaseUid },
				],
			},
			{
				$push: {
					notes: {
						$each: [note],
						$position: 0,
					} as any, // Type assertion to fix the TypeScript error
				},
				$set: { updatedAt: new Date() },
			}
		);

		if (result.matchedCount === 0) {
			return NextResponse.json(
				{ error: { message: "Habit not found or no permission" } },
				{ status: 404 }
			);
		}

		return NextResponse.json({
			success: true,
			note,
			message: "Note added successfully",
		});
	} catch (error: any) {
		console.error("Add note error:", error);
		return NextResponse.json(
			{ error: { message: "Failed to add note", details: error.message } },
			{ status: 500 }
		);
	}
}

// DELETE - Delete a habit
export async function DELETE(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const user = await requireAuth(request);
		const params = await context.params;
		const habitId = params.id;

		const db = await getDatabase();

		// Get current user
		const currentUser = await getCurrentUser(db, user);
		if (!currentUser) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		// Delete the habit
		const result = await db.collection("habits").deleteOne({
			_id: new ObjectId(habitId),
			$or: [
				{ userId: currentUser._id },
				{ userFirebaseUid: currentUser.firebaseUid },
			],
		});

		if (result.deletedCount === 0) {
			return NextResponse.json(
				{ error: { message: "Habit not found or no permission" } },
				{ status: 404 }
			);
		}

		// Also delete completion records
		await db.collection("habit_completions").deleteMany({
			habitId: new ObjectId(habitId),
			$or: [
				{ userId: currentUser._id },
				{ userFirebaseUid: currentUser.firebaseUid },
			],
		});

		return NextResponse.json({
			success: true,
			message: "Habit deleted successfully",
		});
	} catch (error: any) {
		console.error("Delete habit error:", error);
		return NextResponse.json(
			{ error: { message: "Failed to delete habit", details: error.message } },
			{ status: 500 }
		);
	}
}

// ==================== HELPER FUNCTIONS ====================

function calculateCurrentStreak(completions: any[]): number {
	let streak = 0;
	const today = new Date().toISOString().split("T")[0];
	const sorted = [...completions].sort((a, b) => b.date.localeCompare(a.date));

	// Count consecutive completed days starting from today
	for (const comp of sorted) {
		if (comp.completed) {
			streak++;
		} else {
			break; // Streak broken
		}
	}

	return streak;
}

function calculateBestStreak(completions: any[]): number {
	let bestStreak = 0;
	let currentStreak = 0;

	const sorted = [...completions].sort((a, b) => a.date.localeCompare(b.date));

	for (const comp of sorted) {
		if (comp.completed) {
			currentStreak++;
			bestStreak = Math.max(bestStreak, currentStreak);
		} else {
			currentStreak = 0; // Reset streak
		}
	}

	return bestStreak;
}

function calculateWeeklyTrend(completions: any[]): any {
	const last28Days = completions.slice(0, 28);
	const weeklyData = [];

	// Calculate for last 4 weeks
	for (let i = 0; i < 4; i++) {
		const weekCompletions = last28Days.slice(i * 7, (i + 1) * 7);
		const completedCount = weekCompletions.filter((c) => c.completed).length;
		const totalDays = weekCompletions.length || 1; // Avoid division by zero
		weeklyData.push({
			week: i + 1,
			completionRate: Math.round((completedCount / totalDays) * 100),
			totalCompletions: completedCount,
			averageTime:
				weekCompletions.length > 0
					? Math.round(
							weekCompletions.reduce((sum, c) => sum + (c.timeSpent || 0), 0) /
								weekCompletions.length
					  )
					: 0,
		});
	}

	return weeklyData;
}

function calculateBestDay(completions: any[]): { day: string; count: number } {
	const dayMap: Record<string, number> = {};

	completions.forEach((comp) => {
		if (comp.completed) {
			const date = new Date(comp.date);
			const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
			dayMap[dayName] = (dayMap[dayName] || 0) + 1;
		}
	});

	let bestDay = "Monday";
	let maxCount = 0;

	Object.entries(dayMap).forEach(([day, count]) => {
		if (count > maxCount) {
			maxCount = count;
			bestDay = day;
		}
	});

	return { day: bestDay, count: maxCount };
}

function calculateWorstDay(completions: any[]): { day: string; count: number } {
	const dayMap: Record<string, number> = {};
	const daysOfWeek = [
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
		"Sunday",
	];

	// Initialize all days with 0
	daysOfWeek.forEach((day) => {
		dayMap[day] = 0;
	});

	// Count completions per day
	completions.forEach((comp) => {
		if (comp.completed) {
			const date = new Date(comp.date);
			const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
			dayMap[dayName] = (dayMap[dayName] || 0) + 1;
		}
	});

	let worstDay = daysOfWeek[0];
	let minCount = Infinity;

	Object.entries(dayMap).forEach(([day, count]) => {
		if (count < minCount) {
			minCount = count;
			worstDay = day;
		}
	});

	return { day: worstDay, count: minCount };
}

function calculateBestTime(completions: any[]): {
	time: string;
	count: number;
} {
	const timeMap: Record<string, number> = {};

	completions.forEach((comp) => {
		if (comp.completed && comp.createdAt) {
			try {
				const date = new Date(comp.createdAt);
				const hour = date.getHours();
				const timeOfDay =
					hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
				timeMap[timeOfDay] = (timeMap[timeOfDay] || 0) + 1;
			} catch (e) {
				// Ignore invalid dates
			}
		}
	});

	let bestTime = "Morning";
	let maxCount = 0;

	Object.entries(timeMap).forEach(([time, count]) => {
		if (count > maxCount) {
			maxCount = count;
			bestTime = time;
		}
	});

	return { time: bestTime, count: maxCount };
}

function calculateMoodCorrelation(completions: any[]): number {
	const completedWithMood = completions.filter(
		(c) => c.completed && c.mood !== null && c.mood !== undefined
	);

	if (completedWithMood.length < 2) {
		return 0;
	}

	const moods = completedWithMood.map((c) => c.mood);
	const averageMood = moods.reduce((sum, mood) => sum + mood, 0) / moods.length;

	// Simple correlation: higher average mood for completed habits
	return Math.min(100, Math.round(averageMood * 20)); // Convert 1-5 scale to 0-100%
}

function calculateProductivityImpact(completions: any[]): number {
	const completedWithProd = completions.filter(
		(c) =>
			c.completed && c.productivity !== null && c.productivity !== undefined
	);

	if (completedWithProd.length < 2) {
		return 0;
	}

	const productivity = completedWithProd.map((c) => c.productivity);
	const averageProductivity =
		productivity.reduce((sum, prod) => sum + prod, 0) / productivity.length;

	// Simple impact score
	return Math.min(100, Math.round(averageProductivity * 20)); // Convert 1-5 scale to 0-100%
}

function calculateConsistencyScore(completions: any[]): number {
	if (completions.length === 0) return 0;

	const completedCount = completions.filter((c) => c.completed).length;
	const totalDays = completions.length;
	const completionRate = (completedCount / totalDays) * 100;

	// Factor in streak consistency
	const streakScore = calculateBestStreak(completions) * 2;

	// Combined score (0-100)
	const consistencyScore =
		completionRate * 0.7 + Math.min(streakScore * 0.3, 30);
	return Math.round(Math.min(consistencyScore, 100));
}

function generateAIAnalysis(stats: any, habit: Habit): string {
	const {
		successRate,
		currentStreak,
		bestStreak,
		averageCompletionTime,
		consistencyScore,
	} = stats;

	let analysis = `Analysis for **${habit.name}**:\n\n`;

	// Success rate analysis
	if (successRate >= 80) {
		analysis += `🎯 **Excellent Consistency**: You're maintaining a ${successRate.toFixed(
			1
		)}% success rate. You've mastered this habit!\n\n`;
	} else if (successRate >= 60) {
		analysis += `👍 **Good Progress**: You're at ${successRate.toFixed(
			1
		)}% success rate. Keep up the good work!\n\n`;
	} else if (successRate >= 40) {
		analysis += `📈 **Building Momentum**: Your current success rate is ${successRate.toFixed(
			1
		)}%. Focus on consistency this week.\n\n`;
	} else {
		analysis += `💪 **Getting Started**: Your current success rate is ${successRate.toFixed(
			1
		)}%. Try pairing this with an existing routine.\n\n`;
	}

	// Streak analysis
	if (currentStreak > 0) {
		analysis += `🔥 **${currentStreak}-Day Streak**: `;
		if (currentStreak >= bestStreak) {
			analysis += "That's your personal best! Keep it going!\n\n";
		} else {
			analysis += `Your best streak was ${bestStreak} days. You're getting there!\n\n`;
		}
	}

	// Time analysis
	if (averageCompletionTime > 0) {
		analysis += `⏱️ **Average Time**: ${Math.round(
			averageCompletionTime
		)} minutes per session.\n\n`;
	}

	// Consistency score
	if (consistencyScore >= 80) {
		analysis += `🌟 **Consistency Score**: ${consistencyScore}/100 - You're incredibly consistent!\n\n`;
	} else if (consistencyScore >= 60) {
		analysis += `📊 **Consistency Score**: ${consistencyScore}/100 - Good consistency, room for improvement.\n\n`;
	} else {
		analysis += `📊 **Consistency Score**: ${consistencyScore}/100 - Focus on building consistency.\n\n`;
	}

	// Personalized tips based on stats
	if (successRate < 50) {
		analysis +=
			"💡 **Tip**: Try setting a daily reminder or doing this habit at the same time each day.";
	} else if (currentStreak >= 7) {
		analysis +=
			"💡 **Tip**: Consider increasing the challenge slightly to keep it engaging.";
	} else if (consistencyScore < 60) {
		analysis +=
			"💡 **Tip**: Focus on completing this habit 3 times this week to build momentum.";
	} else {
		analysis +=
			"💡 **Tip**: You're doing great! Consider sharing your progress with friends.";
	}

	return analysis;
}

function generateInsights(stats: any, habit: Habit): any[] {
	const insights = [];
	const { bestDay, worstDay, bestTime, moodCorrelation, productivityImpact } =
		stats;

	// Best day insight
	if (bestDay.count > 0) {
		insights.push({
			type: "best_day",
			title: "Your Best Day",
			description: `You're most consistent on ${bestDay.day}s with ${bestDay.count} completions.`,
			icon: "📈",
			suggestion: `Schedule ${habit.name} for ${bestDay.day} mornings for maximum consistency.`,
		});
	}

	// Worst day insight
	if (worstDay.count === 0 && bestDay.count > 0) {
		insights.push({
			type: "worst_day",
			title: "Room for Improvement",
			description: `You haven't completed this habit on ${worstDay.day}s yet.`,
			icon: "📅",
			suggestion: `Try setting a reminder for ${worstDay.day} to improve your weekly consistency.`,
		});
	}

	// Best time insight
	if (bestTime.count > 0) {
		insights.push({
			type: "best_time",
			title: "Optimal Time",
			description: `You're most successful completing this habit in the ${bestTime.time}.`,
			icon: "⏰",
			suggestion: `Keep scheduling ${habit.name} for the ${bestTime.time} for best results.`,
		});
	}

	// Mood correlation insight
	if (moodCorrelation > 60) {
		insights.push({
			type: "mood_boost",
			title: "Mood Booster",
			description: `Completing this habit correlates with ${moodCorrelation}% better mood.`,
			icon: "😊",
			suggestion: "Use this habit as a go-to when you need a mood lift.",
		});
	}

	// Productivity insight
	if (productivityImpact > 60) {
		insights.push({
			type: "productivity",
			title: "Productivity Enhancer",
			description: `This habit boosts your productivity by ${productivityImpact}%.`,
			icon: "⚡",
			suggestion:
				"Do this habit first thing in the morning to set a productive tone.",
		});
	}

	// Add general insights based on stats
	if (stats.successRate > 70 && stats.currentStreak >= 3) {
		insights.push({
			type: "momentum",
			title: "Great Momentum",
			description: "You're building strong momentum with this habit.",
			icon: "🚀",
			suggestion:
				"Consider increasing the difficulty or adding a related habit.",
		});
	}

	return insights;
}

// Handle OPTIONS for CORS
export async function OPTIONS(request: NextRequest) {
	const origin = request.headers.get("origin") || "";
	const allowedOrigins = [
		"https://questzenai.devclinton.org",
		"http://localhost:5173",
		"http://localhost:3000",
	];

	const response = new NextResponse(null, { status: 200 });

	if (allowedOrigins.includes(origin) || origin.includes("localhost")) {
		response.headers.set("Access-Control-Allow-Origin", origin);
	}

	response.headers.set(
		"Access-Control-Allow-Methods",
		"GET, POST, PUT, PATCH, DELETE, OPTIONS"
	);
	response.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization"
	);
	response.headers.set("Access-Control-Allow-Credentials", "true");
	response.headers.set("Access-Control-Max-Age", "86400");

	return response;
}

export const runtime = "nodejs";
