import { sendHabitReminderEmail } from "@/lib/habitReminder";
import { getDatabase } from "@/lib/mongodb";
import { Document, ObjectId, WithId } from "mongodb";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Define habit interface that extends MongoDB types
interface HabitDocument extends WithId<Document> {
	name: string;
	userId?: any; // Make optional since we're seeing undefined
	settings?: {
		timeOfDay?: string | string[];
		reminders?: {
			enabled?: boolean;
		};
	};
	description?: string;
	category?: string;
	stats?: {
		currentStreak?: number;
		successRate?: number;
	};
	isCollaborative?: boolean;
	collaborators?: any[];
}

export async function GET(request: Request) {
	const startTime = Date.now();
	const jobId = Math.random().toString(36).substring(7);

	console.log(`🚀 Cron Job ${jobId} started at ${new Date().toISOString()}`);

	try {
		// Security check
		const url = new URL(request.url);
		const authHeader = request.headers.get("authorization");
		const queryToken = url.searchParams.get("token");
		const cronSecret = process.env.CRON_SECRET;

		const token = authHeader?.replace("Bearer ", "") || queryToken;

		if (!cronSecret || token !== cronSecret) {
			console.warn(
				`❌ Unauthorized cron attempt: ${request.headers.get("user-agent")}`
			);
			return NextResponse.json(
				{
					error: "Unauthorized",
					jobId,
					timestamp: new Date().toISOString(),
				},
				{ status: 401 }
			);
		}

		const db = await getDatabase();
		const now = new Date();
		const currentHour = now.getHours();
		const currentMinute = now.getMinutes();
		const today = now.toISOString().split("T")[0];

		console.log(
			`⏰ ${jobId}: Processing at ${currentHour}:${currentMinute}, date ${today}`
		);

		// 1. Find ACTIVE habits with reminders ENABLED
		const habits = await db
			.collection("habits")
			.find({
				$and: [
					// Active status check
					{
						$or: [{ isActive: true }, { isActive: { $exists: false } }],
					},
					// Reminders enabled check
					{
						$or: [
							{ "settings.reminders.enabled": true },
							{ "reminderSettings.enabled": true },
						],
					},
				],
			})
			.toArray();

		console.log(
			`📊 ${jobId}: Found ${habits.length} active habits with reminders enabled`
		);

		if (habits.length === 0) {
			return NextResponse.json({
				success: true,
				jobId,
				message: "No active habits with reminders enabled",
				executionTime: `${Date.now() - startTime}ms`,
				timestamp: now.toISOString(),
			});
		}

		// 2. Filter by time preferences
		const getTimeWindow = (hour: number): string => {
			if (hour >= 6 && hour < 12) return "morning"; // 6am-11:59am
			if (hour >= 12 && hour < 18) return "afternoon"; // 12pm-5:59pm
			if (hour >= 18 && hour < 22) return "evening"; // 6pm-9:59pm
			return "night"; // 10pm-5:59am
		};

		const currentTimeWindow = getTimeWindow(currentHour);
		console.log(
			`🕐 ${jobId}: Current time window: ${currentTimeWindow} (${currentHour}:${currentMinute})`
		);

		// Type assertion for filtering
		const typedHabits = habits as HabitDocument[];

		const filteredHabits = typedHabits.filter((habit: HabitDocument) => {
			// First, check if userId exists
			if (!habit.userId) {
				console.log(`⚠️ ${jobId}: Habit ${habit._id} has no userId, skipping`);
				return false;
			}

			const timeOfDay = habit.settings?.timeOfDay;

			// If no time preference, include it
			if (!timeOfDay) {
				return true;
			}

			// Handle empty array
			if (Array.isArray(timeOfDay) && timeOfDay.length === 0) {
				return true;
			}

			const timeArray = Array.isArray(timeOfDay) ? timeOfDay : [timeOfDay];

			// Check each time preference
			for (const time of timeArray) {
				if (time === "any") return true;
				if (time === currentTimeWindow) return true;

				// Check specific times
				if (typeof time === "string" && time.includes(":")) {
					const [hourStr] = time.split(":");
					const specifiedHour = parseInt(hourStr, 10);
					if (specifiedHour === currentHour) {
						return true;
					}
				}

				// Check for time ranges like "morning-afternoon"
				if (typeof time === "string" && time.includes("-")) {
					const [start, end] = time.split("-");
					const windows = ["morning", "afternoon", "evening", "night"];
					const startIndex = windows.indexOf(start);
					const endIndex = windows.indexOf(end);
					const currentIndex = windows.indexOf(currentTimeWindow);

					if (startIndex !== -1 && endIndex !== -1 && currentIndex !== -1) {
						if (startIndex <= currentIndex && currentIndex <= endIndex) {
							return true;
						}
					}
				}
			}

			return false;
		});

		console.log(
			`⏰ ${jobId}: After filtering: ${
				filteredHabits.length
			} habits need reminders (removed ${
				typedHabits.length - filteredHabits.length
			} without userId or time mismatch)`
		);

		if (filteredHabits.length === 0) {
			return NextResponse.json({
				success: true,
				jobId,
				message: `No habits match current time window (${currentTimeWindow}) or have userId`,
				habitsChecked: habits.length,
				filteredHabits: 0,
				emailsSent: 0,
				executionTime: `${Date.now() - startTime}ms`,
				timestamp: now.toISOString(),
			});
		}

		// 3. Process habits
		let emailsSent = 0;
		const failedHabits: string[] = [];
		const successfulHabits: string[] = [];

		// Group habits by user to avoid duplicate emails
		const habitsByUser = new Map<string, HabitDocument[]>();

		filteredHabits.forEach((habit: HabitDocument) => {
			// Make sure userId exists before trying to use it
			if (!habit.userId) {
				console.log(
					`⚠️ ${jobId}: Habit ${habit._id} has no userId, skipping grouping`
				);
				return;
			}

			// Handle both string and ObjectId userIds
			let userIdStr: string;
			try {
				userIdStr = habit.userId.toString();
			} catch (error) {
				console.log(
					`⚠️ ${jobId}: Habit ${habit._id} has invalid userId, skipping`
				);
				return;
			}

			if (!habitsByUser.has(userIdStr)) {
				habitsByUser.set(userIdStr, []);
			}
			habitsByUser.get(userIdStr)!.push(habit);
		});

		console.log(
			`👥 ${jobId}: Processing ${habitsByUser.size} users with habits`
		);

		// Process users in batches
		const userIds = Array.from(habitsByUser.keys());

		for (let i = 0; i < userIds.length; i += 3) {
			const userBatch = userIds.slice(i, i + 3);

			await Promise.all(
				userBatch.map(async (userId) => {
					try {
						const userHabits = habitsByUser.get(userId);
						if (!userHabits || userHabits.length === 0) return;

						// Get user info
						const user = await db.collection("users").findOne(
							{ _id: new ObjectId(userId) }, // Convert back to ObjectId
							{
								projection: {
									email: 1,
									displayName: 1,
									timezone: 1,
								},
							}
						);

						if (!user?.email) {
							console.log(`⚠️ ${jobId}: No email for user ${userId}`);
							return;
						}

						// Check if user has been reminded today
						const alreadyRemindedToday = await db
							.collection("habit_reminders")
							.findOne({
								userId: new ObjectId(userId),
								date: today,
							});

						if (alreadyRemindedToday) {
							console.log(
								`⏭️ ${jobId}: User ${user.email} already reminded today`
							);
							return;
						}

						// For now, send reminder for the first habit
						const habit = userHabits[0];

						await sendHabitReminderEmail(
							user.email,
							user.displayName || "QuestZen User",
							{
								name: habit.name,
								description: habit.description || "",
								category: habit.category || "custom",
								timeOfDay: Array.isArray(habit.settings?.timeOfDay)
									? habit.settings.timeOfDay
									: habit.settings?.timeOfDay
									? [habit.settings.timeOfDay as string]
									: [],
								streak: habit.stats?.currentStreak || 0,
								completionRate: habit.stats?.successRate || 0,
								habitId: habit._id.toString(),
								dueTime: now.toISOString(),
								isCollaborative: habit.isCollaborative || false,
								collaboratorsCount: habit.collaborators?.length || 0,
							}
						);

						// Log reminders for all user habits
						const reminderDocs = userHabits.map((habit) => ({
							jobId,
							habitId: habit._id,
							userId: new ObjectId(userId),
							date: today,
							hour: currentHour,
							minute: currentMinute,
							email: user.email,
							sentAt: new Date(),
							createdAt: new Date(),
							timeWindow: currentTimeWindow,
						}));

						await db.collection("habit_reminders").insertMany(reminderDocs);

						emailsSent++;
						successfulHabits.push(...userHabits.map((h) => h.name));

						console.log(
							`✅ ${jobId}: Sent ${userHabits.length} habit reminders to ${user.email}`
						);
					} catch (error: any) {
						console.error(
							`❌ ${jobId}: Failed for user ${userId}:`,
							error.message
						);
						failedHabits.push(`User ${userId}: ${error.message}`);
					}
				})
			);
		}

		const executionTime = Date.now() - startTime;

		return NextResponse.json({
			success: true,
			jobId,
			executionTime: `${executionTime}ms`,
			stats: {
				totalHabits: habits.length,
				filteredHabits: filteredHabits.length,
				uniqueUsers: habitsByUser.size,
				emailsSent: emailsSent,
				habitsInEmails: successfulHabits.length,
				failed: failedHabits.length,
				timeWindow: currentTimeWindow,
				currentTime: `${currentHour}:${currentMinute}`,
			},
			failedDetails:
				failedHabits.length > 0 ? failedHabits.slice(0, 5) : undefined,
			nextRun: "Check GitHub Actions schedule",
			timestamp: now.toISOString(),
		});
	} catch (error: any) {
		console.error(`💥 ${jobId}: Cron job failed:`, error);
		return NextResponse.json(
			{
				success: false,
				jobId,
				error: error.message,
				executionTime: `${Date.now() - startTime}ms`,
				timestamp: new Date().toISOString(),
			},
			{ status: 500 }
		);
	}
}
