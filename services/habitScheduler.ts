import {
	sendHabitReminderEmail,
	sendStreakMilestoneEmail,
} from "@/lib/habitReminder";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import cron from "node-cron";

export class HabitScheduler {
	private db: any;

	async initialize() {
		try {
			this.db = await getDatabase();
			this.startSchedulers();
			console.log("✅ Habit Scheduler initialized");
		} catch (error) {
			console.error("❌ Failed to initialize Habit Scheduler:", error);
		}
	}

	private startSchedulers() {
		// Check every hour for habit reminders
		cron.schedule("0 * * * *", async () => {
			await this.checkHabitReminders();
		});

		// Check daily at midnight for streak milestones
		cron.schedule("0 0 * * *", async () => {
			await this.checkStreakMilestones();
		});

		console.log("⏰ Habit schedulers started");
	}

	async checkHabitReminders() {
		try {
			const now = new Date();
			const currentHour = now.getHours();
			const currentDay = now
				.toLocaleDateString("en-US", { weekday: "long" })
				.toLowerCase();

			console.log(
				`🔔 Checking habit reminders at ${currentHour}:00, day: ${currentDay}`
			);

			// Get all active habits with reminders
			const habits = await this.db
				.collection("habits")
				.find({
					isActive: true,
					"settings.reminders.enabled": true,
					"settings.timeOfDay": { $exists: true, $ne: [] },
				})
				.toArray();

			console.log(`📊 Found ${habits.length} habits with reminders enabled`);

			for (const habit of habits) {
				try {
					// Check if this habit should trigger now
					const shouldTrigger = this.shouldTriggerReminder(
						habit,
						currentHour,
						currentDay
					);

					if (shouldTrigger) {
						await this.sendReminderForHabit(habit);
					}
				} catch (habitError) {
					console.error(`Error processing habit ${habit._id}:`, habitError);
				}
			}
		} catch (error) {
			console.error("Error checking habit reminders:", error);
		}
	}

	private shouldTriggerReminder(
		habit: any,
		currentHour: number,
		currentDay: string
	): boolean {
		const settings = habit.settings || {};
		const reminders = settings.reminders || {};

		// Check if reminders are enabled
		if (!reminders.enabled) return false;

		// Check time of day
		const preferredTimes = settings.timeOfDay || [];
		if (preferredTimes.length === 0) return false;

		// Check if current time matches any preferred time
		const currentTime = `${currentHour}:00`;
		const isTimeMatch = preferredTimes.some((time: string) => {
			if (time === "any") return true;
			if (time === "morning") return currentHour >= 6 && currentHour < 12;
			if (time === "afternoon") return currentHour >= 12 && currentHour < 18;
			if (time === "evening") return currentHour >= 18 && currentHour < 22;
			return time === currentTime;
		});

		if (!isTimeMatch) return false;

		// Check day of week based on frequency
		if (settings.timesPerWeek < 7) {
			// Check if today is a scheduled day
			const schedule = reminders.schedule || [];
			return schedule.includes(currentDay);
		}

		return true;
	}

	private async sendReminderForHabit(habit: any) {
		try {
			// Get user info
			const user = await this.db
				.collection("users")
				.findOne(
					{ _id: habit.userId },
					{ projection: { email: 1, displayName: 1 } }
				);

			if (!user || !user.email) {
				console.log(`No user found for habit ${habit._id}`);
				return;
			}

			// Check if already reminded today
			const today = new Date().toISOString().split("T")[0];
			const alreadyReminded = await this.db
				.collection("habit_reminders")
				.findOne({
					habitId: habit._id,
					userId: habit.userId,
					date: today,
				});

			if (alreadyReminded) {
				console.log(`Already reminded today for habit ${habit.name}`);
				return;
			}

			// Get habit stats
			const completions = await this.db
				.collection("habit_completions")
				.find({
					habitId: habit._id,
					completed: true,
				})
				.toArray();

			const streak = habit.stats?.currentStreak || 0;
			const completionRate =
				completions.length > 0
					? Math.round(
							(completions.filter((c: any) => c.completed).length /
								completions.length) *
								100
					  )
					: 0;

			// Send reminder email
			await sendHabitReminderEmail(user.email, user.displayName, {
				name: habit.name,
				description: habit.description,
				category: habit.category,
				timeOfDay: habit.settings?.timeOfDay || [],
				streak,
				completionRate,
				habitId: habit._id.toString(),
				dueTime: new Date().toISOString(),
				isCollaborative: habit.isCollaborative,
				collaboratorsCount: habit.collaborators?.length || 0,
			});

			// Log the reminder
			await this.db.collection("habit_reminders").insertOne({
				habitId: habit._id,
				userId: habit.userId,
				email: user.email,
				date: today,
				sentAt: new Date(),
				reminderType: "scheduled",
			});

			console.log(`✅ Reminder sent for habit: ${habit.name} to ${user.email}`);
		} catch (error) {
			console.error(`Failed to send reminder for habit ${habit._id}:`, error);
		}
	}

	async checkStreakMilestones() {
		try {
			console.log("🏆 Checking streak milestones...");

			const habits = await this.db
				.collection("habits")
				.find({
					isActive: true,
					"stats.currentStreak": { $gt: 0 },
				})
				.toArray();

			const milestoneStreaks = [7, 30, 100]; // 1 week, 1 month, 100 days

			for (const habit of habits) {
				const streak = habit.stats?.currentStreak || 0;

				if (milestoneStreaks.includes(streak)) {
					await this.sendStreakMilestone(habit, streak);
				}
			}
		} catch (error) {
			console.error("Error checking streak milestones:", error);
		}
	}

	private async sendStreakMilestone(habit: any, streak: number) {
		try {
			const user = await this.db
				.collection("users")
				.findOne(
					{ _id: habit.userId },
					{ projection: { email: 1, displayName: 1 } }
				);

			if (!user || !user.email) return;

			// Check if already celebrated this milestone
			const milestoneKey = `streak_${streak}`;
			const alreadyCelebrated = await this.db
				.collection("habit_milestones")
				.findOne({
					habitId: habit._id,
					milestoneKey,
				});

			if (alreadyCelebrated) return;

			await sendStreakMilestoneEmail(user.email, user.displayName, {
				name: habit.name,
				streak,
				milestone: streak,
				habitId: habit._id.toString(),
			});

			// Log the milestone
			await this.db.collection("habit_milestones").insertOne({
				habitId: habit._id,
				userId: habit.userId,
				milestoneKey,
				streak,
				celebratedAt: new Date(),
			});

			console.log(
				`🎉 Streak milestone (${streak} days) celebrated for ${habit.name}`
			);
		} catch (error) {
			console.error(
				`Failed to send streak milestone for habit ${habit._id}:`,
				error
			);
		}
	}

	// Manual trigger for testing
	async sendTestReminder(habitId: string, email: string) {
		try {
			const habit = await this.db.collection("habits").findOne({
				_id: new ObjectId(habitId),
			});

			if (!habit) {
				throw new Error("Habit not found");
			}

			const user = await this.db
				.collection("users")
				.findOne(
					{ email: email.toLowerCase() },
					{ projection: { email: 1, displayName: 1 } }
				);

			if (!user) {
				throw new Error("User not found");
			}

			await sendHabitReminderEmail(user.email, user.displayName, {
				name: habit.name,
				description: habit.description,
				category: habit.category,
				streak: habit.stats?.currentStreak || 0,
				completionRate: 75,
				habitId: habit._id.toString(),
				dueTime: new Date().toISOString(),
			});

			console.log(`✅ Test reminder sent to ${email}`);
			return true;
		} catch (error) {
			console.error("Failed to send test reminder:", error);
			throw error;
		}
	}
}

// Singleton instance
export const habitScheduler = new HabitScheduler();
