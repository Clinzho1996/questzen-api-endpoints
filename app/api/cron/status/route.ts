import { getDatabase } from "@/lib/mongodb";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	try {
		const db = await getDatabase();

		// Get last 10 reminders
		const recentReminders = await db
			.collection("habit_reminders")
			.find({})
			.sort({ sentAt: -1 })
			.limit(10)
			.toArray();

		// Get today's count
		const today = new Date().toISOString().split("T")[0];
		const todayCount = await db.collection("habit_reminders").countDocuments({
			date: today,
		});

		// Get active habits with reminders
		const activeHabits = await db.collection("habits").countDocuments({
			isActive: true,
			"settings.reminders.enabled": true,
		});

		return NextResponse.json({
			status: "operational",
			serverTime: new Date().toISOString(),
			stats: {
				today: {
					date: today,
					remindersSent: todayCount,
				},
				activeHabitsWithReminders: activeHabits,
				lastCronRun: recentReminders[0]?.sentAt || null,
			},
			recentReminders: recentReminders.map((r) => ({
				time: r.sentAt,
				habitId: r.habitId,
				email: r.email
					? r.email.substring(0, 3) +
					  "..." +
					  r.email.substring(r.email.indexOf("@"))
					: null,
			})),
			githubActions:
				"https://github.com/Clinzho1996/questzen-api-endpoints/actions/workflows/habit-reminders.yml",
			nextRun: new Date(Date.now() + 3600000).toISOString(), // Next hour
		});
	} catch (error: any) {
		return NextResponse.json(
			{
				status: "error",
				error: error.message,
				serverTime: new Date().toISOString(),
			},
			{ status: 500 }
		);
	}
}
