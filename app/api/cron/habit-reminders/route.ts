import { sendHabitReminderEmail } from "@/lib/habitReminder";
import { getDatabase } from "@/lib/mongodb";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

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
		const today = now.toISOString().split("T")[0];

		console.log(
			`⏰ ${jobId}: Processing for hour ${currentHour}, date ${today}`
		);

		// 1. Find all habits with reminders enabled AND active
		const habits = await db
			.collection("habits")
			.find({
				$and: [
					// Active habits
					{ $or: [{ isActive: true }, { isActive: { $exists: false } }] },
					// Reminders enabled
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

		// 2. Filter habits based on timeOfDay settings
		// Better time window logic (match the previous successful run at 18:14)
		const getTimeWindow = (hour: number): string => {
			if (hour >= 6 && hour < 12) return "morning"; // 6am-11:59am
			if (hour >= 12 && hour < 18) return "afternoon"; // 12pm-5:59pm
			if (hour >= 18 && hour < 22) return "evening"; // 6pm-9:59pm
			return "night"; // 10pm-5:59am
		};

		const currentTimeWindow = getTimeWindow(currentHour);
		console.log(
			`🕐 ${jobId}: Current time window: ${currentTimeWindow} (${currentHour}:00)`
		);

		const filteredHabits = habits.filter((habit) => {
			const timeOfDay = habit.settings?.timeOfDay;
			if (!timeOfDay || timeOfDay.length === 0) return true;

			const timeArray = Array.isArray(timeOfDay) ? timeOfDay : [timeOfDay];

			// Check for matches
			return timeArray.some((time) => {
				if (time === "any") return true;
				if (time === currentTimeWindow) return true;

				// Handle time ranges like "morning-afternoon"
				if (time.includes("-")) {
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

				if (time.includes(":")) {
					const [hourStr] = time.split(":");
					return parseInt(hourStr) === currentHour;
				}
				return false;
			});
		});

		console.log(
			`⏰ ${jobId}: After time filtering: ${filteredHabits.length} habits need reminders now`
		);

		if (filteredHabits.length === 0) {
			return NextResponse.json({
				success: true,
				jobId,
				message: "No habits need reminders right now",
				habitsChecked: habits.length,
				filteredHabits: 0,
				emailsSent: 0,
				executionTime: `${Date.now() - startTime}ms`,
				timestamp: now.toISOString(),
			});
		}

		// 3. Get all habit IDs to check for duplicates in one query
		const habitIds = filteredHabits.map((h) => h._id);
		const existingReminders = await db
			.collection("habit_reminders")
			.find({
				habitId: { $in: habitIds },
				date: today,
			})
			.toArray();

		const remindedHabitIds = new Set(
			existingReminders.map((r) => r.habitId.toString())
		);

		console.log(
			`⏭️ ${jobId}: ${remindedHabitIds.size} habits already reminded today`
		);

		// Filter out already reminded habits
		const habitsToRemind = filteredHabits.filter(
			(habit) => !remindedHabitIds.has(habit._id.toString())
		);

		console.log(
			`📧 ${jobId}: ${habitsToRemind.length} habits need fresh reminders`
		);

		if (habitsToRemind.length === 0) {
			return NextResponse.json({
				success: true,
				jobId,
				message: "All filtered habits already reminded today",
				stats: {
					totalHabits: habits.length,
					filteredByTime: filteredHabits.length,
					alreadyReminded: remindedHabitIds.size,
					emailsSent: 0,
					currentTimeWindow: currentTimeWindow,
					currentHour: currentHour,
				},
				executionTime: `${Date.now() - startTime}ms`,
				timestamp: now.toISOString(),
			});
		}

		// 4. Process habits in batches
		let emailsSent = 0;
		const failedHabits: string[] = [];

		for (let i = 0; i < habitsToRemind.length; i += 5) {
			const batch = habitsToRemind.slice(i, i + 5);

			await Promise.all(
				batch.map(async (habit) => {
					try {
						// Get user info
						const user = await db
							.collection("users")
							.findOne(
								{ _id: habit.userId },
								{ projection: { email: 1, displayName: 1 } }
							);

						if (!user?.email) {
							console.log(
								`⚠️ ${jobId}: No email found for habit "${habit.name}" (user: ${habit.userId})`
							);
							return;
						}

						console.log(
							`📨 ${jobId}: Sending reminder for "${habit.name}" to ${user.email}`
						);

						// Send reminder email
						await sendHabitReminderEmail(
							user.email,
							user.displayName || "QuestZen User",
							{
								name: habit.name,
								description: habit.description || "",
								category: habit.category || "custom",
								timeOfDay: habit.settings?.timeOfDay || [],
								streak: habit.stats?.currentStreak || 0,
								completionRate: habit.stats?.successRate || 0,
								habitId: habit._id.toString(),
								dueTime: now.toISOString(),
								isCollaborative: habit.isCollaborative || false,
								collaboratorsCount: habit.collaborators?.length || 0,
							}
						);

						// Log successful reminder
						await db.collection("habit_reminders").insertOne({
							jobId,
							habitId: habit._id,
							userId: habit.userId,
							date: today,
							hour: currentHour,
							email: user.email,
							sentAt: new Date(),
							createdAt: new Date(),
							timeWindow: currentTimeWindow,
						});

						emailsSent++;
						console.log(
							`✅ ${jobId}: Sent reminder for "${habit.name}" to ${user.email}`
						);
					} catch (error: any) {
						console.error(
							`❌ ${jobId}: Failed for habit "${habit.name}":`,
							error.message
						);
						failedHabits.push(`${habit.name}: ${error.message}`);
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
				filteredByTime: filteredHabits.length,
				alreadyReminded: remindedHabitIds.size,
				habitsToRemind: habitsToRemind.length,
				emailsSent: emailsSent,
				failed: failedHabits.length,
				currentTimeWindow: currentTimeWindow,
				currentHour: currentHour,
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
