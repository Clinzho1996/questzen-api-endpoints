import { sendHabitReminderEmail } from "@/lib/habitReminder";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
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

		// 1. Get ALL habits with reminders enabled
		const allHabits = await db
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
			.project({
				name: 1,
				userId: 1,
				"settings.timeOfDay": 1,
				description: 1,
				category: 1,
				stats: 1,
				isCollaborative: 1,
				collaborators: 1,
				isPredefined: 1,
				isFromPredefined: 1,
				createdAt: 1,
			})
			.toArray();

		console.log(
			`📊 ${jobId}: Found ${allHabits.length} total habits with reminders enabled`
		);

		// Debug: Show habit distribution
		const predefinedTemplates = allHabits.filter(
			(h) => h.isPredefined === true
		);
		const userAddedFromPredefined = allHabits.filter(
			(h) => h.isFromPredefined === true
		);
		const customHabits = allHabits.filter(
			(h) => h.isPredefined === false && h.isFromPredefined === false
		);
		const habitsWithUserId = allHabits.filter((h) => h.userId).length;
		const habitsWithoutUserId = allHabits.filter((h) => !h.userId).length;

		console.log(`🔍 ${jobId}: Habit breakdown:`, {
			predefinedTemplates: predefinedTemplates.length,
			userAddedFromPredefined: userAddedFromPredefined.length,
			customHabits: customHabits.length,
			withUserId: habitsWithUserId,
			withoutUserId: habitsWithoutUserId,
		});

		// 2. Filter habits: Skip predefined templates but keep user-added predefined habits
		const validUserHabits = allHabits.filter((habit) => {
			// Skip predefined habit TEMPLATES (isPredefined: true)
			if (habit.isPredefined === true) {
				return false;
			}

			// User-added predefined habits (isFromPredefined: true) should have userId
			// Custom habits (isPredefined: false, isFromPredefined: false) should have userId

			// Check if userId exists and is valid
			if (!habit.userId) {
				console.log(
					`⚠️ ${jobId}: Skipping habit "${habit.name}" - no userId (isPredefined: ${habit.isPredefined}, isFromPredefined: ${habit.isFromPredefined})`
				);
				return false;
			}

			// Validate userId format
			try {
				if (habit.userId instanceof ObjectId) {
					return true;
				}

				if (typeof habit.userId === "string") {
					// Try to create ObjectId to validate
					new ObjectId(habit.userId);
					return true;
				}

				console.log(
					`⚠️ ${jobId}: Skipping habit "${
						habit.name
					}" - invalid userId type: ${typeof habit.userId}`
				);
				return false;
			} catch (error) {
				console.log(
					`⚠️ ${jobId}: Skipping habit "${habit.name}" - invalid userId format: ${habit.userId}`
				);
				return false;
			}
		});

		console.log(
			`👤 ${jobId}: ${validUserHabits.length} user habits with valid userIds`
		);

		// 3. Filter by time window
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

		const filteredHabits = validUserHabits.filter((habit) => {
			const timeOfDay = habit.settings?.timeOfDay;
			if (!timeOfDay || timeOfDay.length === 0) return true;

			const timeArray = Array.isArray(timeOfDay) ? timeOfDay : [timeOfDay];

			return timeArray.some((time) => {
				if (time === "any") return true;
				if (time === currentTimeWindow) return true;

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
			`⏰ ${jobId}: After time filtering: ${filteredHabits.length} habits need reminders`
		);

		// Debug: Show which habits passed time filtering
		if (filteredHabits.length > 0) {
			console.log(`📝 ${jobId}: Habits that passed time filter:`);
			filteredHabits.forEach((habit) => {
				console.log(
					`   - "${habit.name}" (userId: ${
						habit.userId
					}, timeOfDay: ${JSON.stringify(habit.settings?.timeOfDay)})`
				);
			});
		}

		if (filteredHabits.length === 0) {
			return NextResponse.json({
				success: true,
				jobId,
				message: "No habits need reminders right now",
				stats: {
					totalHabits: allHabits.length,
					validUserHabits: validUserHabits.length,
					filteredHabits: 0,
					currentTimeWindow: currentTimeWindow,
					currentHour: currentHour,
					breakdown: {
						predefinedTemplates: predefinedTemplates.length,
						userAddedFromPredefined: userAddedFromPredefined.length,
						customHabits: customHabits.length,
					},
				},
				executionTime: `${Date.now() - startTime}ms`,
				timestamp: now.toISOString(),
			});
		}

		// 4. Check for duplicates
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
					totalHabits: allHabits.length,
					validUserHabits: validUserHabits.length,
					filteredHabits: filteredHabits.length,
					alreadyReminded: remindedHabitIds.size,
					emailsSent: 0,
					currentTimeWindow: currentTimeWindow,
					currentHour: currentHour,
				},
				executionTime: `${Date.now() - startTime}ms`,
				timestamp: now.toISOString(),
			});
		}

		// 5. Get all unique users in one query
		const userIds = habitsToRemind
			.map((h) => h.userId)
			.filter(
				(userId, index, self) => userId && self.indexOf(userId) === index
			);

		console.log(`👥 ${jobId}: Looking up ${userIds.length} unique users`);

		// Convert userIds to ObjectIds
		const userObjectIds = userIds
			.map((id) => {
				try {
					if (id instanceof ObjectId) return id;
					return new ObjectId(id);
				} catch {
					console.log(`⚠️ ${jobId}: Invalid user ID format: ${id}`);
					return null;
				}
			})
			.filter((id) => id !== null);

		// Debug: Show which user IDs we're looking for
		console.log(
			`🔍 ${jobId}: User IDs to lookup:`,
			userObjectIds.map((id) => id.toString())
		);

		// Get users
		const users = await db
			.collection("users")
			.find({
				_id: { $in: userObjectIds },
			})
			.project({
				email: 1,
				displayName: 1,
				_id: 1,
			})
			.toArray();

		const userMap = new Map();
		users.forEach((user) => {
			userMap.set(user._id.toString(), user);
		});

		console.log(`👤 ${jobId}: Found ${users.length} users in database`);

		// Debug: Show which users were found vs missing
		const foundUserIds = users.map((u) => u._id.toString());
		const missingUserIds = userObjectIds
			.map((id) => id.toString())
			.filter((id) => !foundUserIds.includes(id));

		if (missingUserIds.length > 0) {
			console.log(`❌ ${jobId}: Missing users with IDs:`, missingUserIds);

			// Find habits with missing users for debugging
			const habitsWithMissingUsers = habitsToRemind.filter((habit) => {
				const habitUserId =
					habit.userId instanceof ObjectId
						? habit.userId.toString()
						: String(habit.userId);
				return missingUserIds.includes(habitUserId);
			});

			console.log(`🔍 ${jobId}: Habits with missing users:`);
			habitsWithMissingUsers.forEach((habit) => {
				console.log(
					`   - "${habit.name}" (userId: ${habit.userId}, created: ${habit.createdAt})`
				);
			});
		}

		// 6. Process habits
		let emailsSent = 0;
		const failedHabits: string[] = [];
		const successfulHabits: string[] = [];

		for (let i = 0; i < habitsToRemind.length; i += 5) {
			const batch = habitsToRemind.slice(i, i + 5);

			await Promise.all(
				batch.map(async (habit) => {
					try {
						// Get user ID string for lookup
						let userIdStr: string;
						if (habit.userId instanceof ObjectId) {
							userIdStr = habit.userId.toString();
						} else if (typeof habit.userId === "string") {
							userIdStr = habit.userId;
						} else {
							console.log(
								`⚠️ ${jobId}: Invalid userId type for habit "${
									habit.name
								}": ${typeof habit.userId}`
							);
							return;
						}

						const user = userMap.get(userIdStr);

						if (!user) {
							console.log(
								`❌ ${jobId}: User ${userIdStr} not found for habit "${habit.name}" - user may have been deleted`
							);
							// Optional: Disable reminders for this habit since user doesn't exist
							await db
								.collection("habits")
								.updateOne(
									{ _id: habit._id },
									{ $set: { "settings.reminders.enabled": false } }
								);
							console.log(
								`🔄 ${jobId}: Disabled reminders for orphaned habit "${habit.name}"`
							);
							return;
						}

						if (!user.email) {
							console.log(
								`⚠️ ${jobId}: User ${userIdStr} has no email for habit "${habit.name}"`
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
						successfulHabits.push(habit.name);
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
				totalHabits: allHabits.length,
				validUserHabits: validUserHabits.length,
				filteredHabits: filteredHabits.length,
				alreadyReminded: remindedHabitIds.size,
				habitsToRemind: habitsToRemind.length,
				uniqueUsers: userIds.length,
				usersFound: users.length,
				missingUsers: missingUserIds.length,
				emailsSent: emailsSent,
				successfulHabits: successfulHabits.length,
				failed: failedHabits.length,
				currentTimeWindow: currentTimeWindow,
				currentHour: currentHour,
				breakdown: {
					predefinedTemplates: predefinedTemplates.length,
					userAddedFromPredefined: userAddedFromPredefined.length,
					customHabits: customHabits.length,
				},
			},
			successfulHabits: successfulHabits.slice(0, 10),
			failedDetails:
				failedHabits.length > 0 ? failedHabits.slice(0, 5) : undefined,
			missingUsers: missingUserIds.length > 0 ? missingUserIds : undefined,
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
