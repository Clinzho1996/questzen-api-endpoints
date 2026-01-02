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

		// 1. Find all habits with reminders enabled
		const habits = await db
			.collection("habits")
			.find({
				$or: [
					{ "settings.reminders.enabled": true },
					{ "settings.reminders": { $exists: true } }, // If reminders object exists
					{ "reminderSettings.enabled": true }, // Alternative field name
					{ "reminders.enabled": true }, // Another possibility
				],
			})
			.toArray();

		console.log(
			`📊 ${jobId}: Found ${habits.length} habits with reminders enabled`
		);

		// 2. Filter habits based on timeOfDay settings
		// Better time window logic
		const getTimeWindow = (hour: number): string => {
			if (hour >= 5 && hour < 11) return "morning"; // 5am-11am
			if (hour >= 11 && hour < 17) return "afternoon"; // 11am-5pm
			if (hour >= 17 && hour < 23) return "evening"; // 5pm-11pm
			return "night"; // 11pm-5am
		};

		const currentTimeWindow = getTimeWindow(currentHour);

		const filteredHabits = habits.filter((habit) => {
			const timeOfDay = habit.settings?.timeOfDay;
			if (!timeOfDay || timeOfDay.length === 0) return true;

			const timeArray = Array.isArray(timeOfDay) ? timeOfDay : [timeOfDay];

			// Check for matches
			return timeArray.some((time) => {
				if (time === "any") return true;
				if (time === currentTimeWindow) return true;
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

		// 3. Process FILTERED habits in batches
		let emailsSent = 0;
		const failedHabits: string[] = [];

		for (let i = 0; i < filteredHabits.length; i += 5) {
			const batch = filteredHabits.slice(i, i + 5);

			await Promise.all(
				batch.map(async (habit) => {
					try {
						// Check if already reminded today
						const alreadyReminded = await db
							.collection("habit_reminders")
							.findOne({
								habitId: habit._id,
								date: today,
							});

						if (alreadyReminded) {
							console.log(
								`⏭️ ${jobId}: Already reminded today for habit ${habit.name}`
							);
							return;
						}

						// Get user info
						const user = await db
							.collection("users")
							.findOne(
								{ _id: habit.userId },
								{ projection: { email: 1, displayName: 1 } }
							);

						if (!user?.email) {
							console.log(
								`⚠️ ${jobId}: No email found for habit ${habit.name}`
							);
							return;
						}

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
						});

						emailsSent++;
						console.log(
							`✅ ${jobId}: Sent reminder for "${habit.name}" to ${user.email}`
						);
					} catch (error: any) {
						console.error(
							`❌ ${jobId}: Failed for habit ${habit.name}:`,
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
			habitsChecked: habits.length,
			filteredHabits: filteredHabits.length,
			emailsSent: emailsSent,
			failed: failedHabits.length,
			failedDetails: failedHabits.length > 0 ? failedHabits : undefined,
			nextRun: new Date(Date.now() + 3600000).toISOString(),
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
