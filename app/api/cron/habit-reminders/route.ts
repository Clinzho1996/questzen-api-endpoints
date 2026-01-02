import { sendHabitReminderEmail } from "@/lib/habitReminder";
import { getDatabase } from "@/lib/mongodb";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // Important for Vercel
export const maxDuration = 10; // 10 second timeout

export async function GET(request: Request) {
	const startTime = Date.now();
	const jobId = Math.random().toString(36).substring(7);

	console.log(`🚀 Cron Job ${jobId} started at ${new Date().toISOString()}`);

	try {
		// Security check - accept both header and query param
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

		// 1. Find habits that need reminders
		const habits = await db
			.collection("habits")
			.find({
				isActive: true,
				"settings.reminders.enabled": true,
				$or: [
					{ "settings.timeOfDay": "any" },
					{
						"settings.timeOfDay": "morning",
						$where: "this.currentHour >= 6 && this.currentHour < 12",
					},
					{
						"settings.timeOfDay": "afternoon",
						$where: "this.currentHour >= 12 && this.currentHour < 18",
					},
					{
						"settings.timeOfDay": "evening",
						$where: "this.currentHour >= 18 && this.currentHour < 22",
					},
					{ "settings.timeOfDay": currentHour.toString() + ":00" },
				],
			})
			.toArray();

		console.log(
			`📊 ${jobId}: Found ${habits.length} habits with reminders enabled`
		);

		if (habits.length === 0) {
			return NextResponse.json({
				success: true,
				jobId,
				message: "No habits need reminders right now",
				habitsChecked: 0,
				emailsSent: 0,
				executionTime: `${Date.now() - startTime}ms`,
				timestamp: now.toISOString(),
			});
		}

		// 2. Process habits in batches
		let emailsSent = 0;
		const failedHabits: string[] = [];

		for (let i = 0; i < habits.length; i += 5) {
			// Small batches to avoid timeout
			const batch = habits.slice(i, i + 5);

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
			emailsSent: emailsSent,
			failed: failedHabits.length,
			failedDetails: failedHabits.length > 0 ? failedHabits : undefined,
			nextRun: new Date(Date.now() + 3600000).toISOString(), // Next hour
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
