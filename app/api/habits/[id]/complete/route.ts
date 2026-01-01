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
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		const targetDate = date || new Date().toISOString().split("T")[0];
		console.log("🎯 Target date for completion:", targetDate);

		// Check if habit exists
		const habit = await db.collection("habits").findOne({
			_id: new ObjectId(habitId),
		});

		if (!habit) {
			console.error("❌ Habit not found:", habitId);
			return NextResponse.json(
				{ error: { message: "Habit not found" } },
				{ status: 404 }
			);
		}

		console.log("🔍 Looking for existing completion record...");

		// Try to find existing completion first
		const existingCompletion = await db
			.collection("habit_completions")
			.findOne({
				habitId: new ObjectId(habitId),
				$or: [
					{ userId: currentUser._id },
					{ userFirebaseUid: currentUser.firebaseUid || user.userId },
				],
				date: targetDate,
			});

		let completion;

		if (existingCompletion) {
			console.log("📝 Updating existing completion record");
			// Update existing record
			const updateResult = await db.collection("habit_completions").updateOne(
				{ _id: existingCompletion._id },
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
				}
			);

			if (updateResult.modifiedCount > 0) {
				completion = await db.collection("habit_completions").findOne({
					_id: existingCompletion._id,
				});
			}
		} else {
			console.log("✨ Creating new completion record");
			// Create new record
			const newCompletion = {
				habitId: new ObjectId(habitId),
				userId: currentUser._id,
				userFirebaseUid: currentUser.firebaseUid || user.userId,
				userEmail: currentUser.email,
				userDisplayName: currentUser.displayName,
				date: targetDate,
				completed: true,
				mood: mood || null,
				productivity: productivity || null,
				notes: notes || "",
				timeSpent: timeSpent || 0,
				count: 1,
				completedAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const insertResult = await db
				.collection("habit_completions")
				.insertOne(newCompletion);
			completion = { ...newCompletion, _id: insertResult.insertedId };
		}

		if (!completion) {
			console.error("❌ Failed to create or update completion record");
			return NextResponse.json(
				{ error: { message: "Failed to record habit completion" } },
				{ status: 500 }
			);
		}

		console.log("✅ Completion recorded successfully:", {
			completionId: completion._id,
			habitId: habitId,
			date: targetDate,
		});

		// Update habit stats
		console.log("📊 Updating habit stats...");
		const updateHabitResult = await db.collection("habits").updateOne(
			{ _id: new ObjectId(habitId) },
			{
				$inc: {
					"stats.totalCompletions": 1,
					"stats.totalMinutesSpent": timeSpent || 0,
				},
				$set: {
					"stats.updatedAt": new Date(),
					updatedAt: new Date(),
				},
			}
		);

		console.log("✅ Habit stats updated:", updateHabitResult.modifiedCount > 0);

		// Calculate streak
		console.log("🔥 Calculating streaks...");
		const streakData = await db
			.collection("habit_completions")
			.aggregate([
				{
					$match: {
						habitId: new ObjectId(habitId),
						$or: [
							{ userId: currentUser._id },
							{ userFirebaseUid: currentUser.firebaseUid || user.userId },
						],
						completed: true,
					},
				},
				{
					$sort: { date: 1 },
				},
				{
					$group: {
						_id: null,
						dates: { $push: "$date" },
					},
				},
			])
			.toArray();

		// Get current streak
		let currentStreak = 0;
		if (streakData.length > 0) {
			const dates = streakData[0].dates;
			dates.sort((a: string, b: string) => b.localeCompare(a)); // Sort descending

			const today = new Date().toISOString().split("T")[0];
			const yesterday = new Date(Date.now() - 86400000)
				.toISOString()
				.split("T")[0];

			for (let i = 0; i < dates.length; i++) {
				if (i === 0) {
					if (dates[i] === today || dates[i] === yesterday) {
						currentStreak = 1;
					} else {
						break;
					}
				} else {
					const prevDate = new Date(dates[i - 1]);
					const currDate = new Date(dates[i]);
					const diffDays = Math.floor(
						(prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24)
					);

					if (diffDays === 1) {
						currentStreak++;
					} else {
						break;
					}
				}
			}
		}

		const successRate = await calculateSuccessRate(
			db,
			new ObjectId(habitId),
			currentUser._id
		);
		// Update streak in habit
		await db.collection("habits").updateOne(
			{ _id: new ObjectId(habitId) },
			{
				$set: {
					"stats.successRate": successRate,
					"stats.currentStreak": currentStreak,
					"stats.bestStreak": Math.max(
						currentStreak,
						habit.stats?.bestStreak || 0
					),
				},
			}
		);

		// Get updated habit
		const updatedHabit = await db.collection("habits").findOne(
			{ _id: new ObjectId(habitId) },
			{
				projection: {
					name: 1,
					completedToday: 1,
					progress: 1,
					stats: 1,
					settings: 1,
					isActive: 1,
				},
			}
		);

		const xpEarned = 10; // Base XP for habit completion
		const xpUpdateResult = await updateUserXP(
			db,
			currentUser._id,
			xpEarned,
			"habit_completion"
		);

		console.log("💰 XP Update Result:", xpUpdateResult);
		return NextResponse.json({
			success: true,
			completion: completion,
			xpEarned: xpEarned,
			userXP: xpUpdateResult?.xp || 0,
			userLevel: xpUpdateResult?.level || 1,
			habit: updatedHabit,
			currentStreak: currentStreak,
			message: "Habit completed successfully!",
		});
	} catch (error: any) {
		console.error("❌ Complete habit error:", error);
		console.error("❌ Error stack:", error.stack);
		return NextResponse.json(
			{
				error: { message: "Failed to complete habit", details: error.message },
			},
			{ status: 500 }
		);
	}
}

async function updateUserXP(
	db: any,
	userId: ObjectId,
	xpToAdd: number,
	action: string
) {
	console.log(`💰 Adding ${xpToAdd} XP for ${action}`);

	const result = await db.collection("users").findOneAndUpdate(
		{ _id: userId },
		{
			$inc: { xp: xpToAdd },
			$set: { updatedAt: new Date() },
		},
		{
			returnDocument: "after",
			projection: { xp: 1, level: 1 },
		}
	);

	if (result.value) {
		// Check for level up
		const currentXP = result.value.xp || 0;
		const currentLevel = result.value.level || 1;
		const newLevel = Math.floor(currentXP / 1000) + 1;

		if (newLevel > currentLevel) {
			// Update level
			await db
				.collection("users")
				.updateOne({ _id: userId }, { $set: { level: newLevel } });
			console.log(`🎉 Level up! From ${currentLevel} to ${newLevel}`);
		}

		return { xp: currentXP, level: newLevel };
	}

	return null;
}

async function calculateSuccessRate(
	db: any,
	habitId: ObjectId,
	userId: ObjectId
) {
	// Get total completion attempts for this habit
	const completions = await db
		.collection("habit_completions")
		.find({
			habitId: habitId,
			userId: userId,
		})
		.toArray();

	if (completions.length === 0) return 0;

	// Calculate success rate based on completed vs total
	const completed = completions.filter((c: any) => c.completed === true);
	const successRate = Math.round((completed.length / completions.length) * 100);

	console.log("📊 Success rate calculation:", {
		totalAttempts: completions.length,
		completed: completed.length,
		successRate: `${successRate}%`,
	});

	return successRate;
}
