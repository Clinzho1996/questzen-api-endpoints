import { getDatabase } from "@/lib/mongodb";
import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

async function enableAllHabitReminders() {
	console.log("🚀 Starting habit reminders migration...");

	// Check if MONGODB_URI is set
	if (!process.env.MONGODB_URI) {
		console.error("❌ MONGODB_URI is not defined in environment variables");
		console.log("💡 Make sure you have a .env.local file with MONGODB_URI");
		process.exit(1);
	}

	try {
		const db = await getDatabase();
		const habitsCollection = db.collection("habits");

		// Count before
		const beforeCount = await habitsCollection.countDocuments({
			"settings.reminders.enabled": true,
		});
		const totalHabits = await habitsCollection.countDocuments({});

		console.log(
			`📊 Before: ${beforeCount}/${totalHabits} habits have reminders enabled`
		);

		if (totalHabits === 0) {
			console.log("📭 No habits found in database");
			return;
		}

		// Update ALL habits to have reminders enabled
		const result = await habitsCollection.updateMany(
			{},
			{
				$set: {
					"settings.reminders": {
						enabled: true,
						schedule: ["daily"],
						email: true,
						push: false,
						updatedAt: new Date(),
					},
					updatedAt: new Date(),
				},
			}
		);

		// Count after
		const afterCount = await habitsCollection.countDocuments({
			"settings.reminders.enabled": true,
		});

		console.log(`✅ Migration complete!`);
		console.log(`📊 Updated: ${result.modifiedCount} habits`);
		console.log(
			`📊 After: ${afterCount}/${totalHabits} habits have reminders enabled`
		);

		if (afterCount === totalHabits) {
			console.log("🎉 All habits now have reminders enabled!");
		} else {
			console.log(
				`⚠️ Warning: ${
					totalHabits - afterCount
				} habits still don't have reminders enabled`
			);
		}
	} catch (error: any) {
		console.error("❌ Migration failed:", error.message);
		process.exit(1);
	}
}

// Run the migration
if (require.main === module) {
	enableAllHabitReminders().then(() => {
		console.log("✨ Migration script completed");
		process.exit(0);
	});
}

export { enableAllHabitReminders };
