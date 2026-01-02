// scripts/fix-time-settings.ts
import { getDatabase } from "@/lib/mongodb";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

async function fixHabitTimeSettings() {
	console.log("🔄 Fixing habit time settings...");

	if (!process.env.MONGODB_URI) {
		console.error("❌ MONGODB_URI is not defined");
		process.exit(1);
	}

	try {
		const db = await getDatabase();
		const habitsCollection = db.collection("habits");

		// Update habits without proper timeOfDay
		const result = await habitsCollection.updateMany(
			{
				$or: [
					{ "settings.timeOfDay": { $exists: false } },
					{ "settings.timeOfDay": null },
					{ "settings.timeOfDay": [] },
				],
			},
			{
				$set: {
					"settings.timeOfDay": ["any"],
					updatedAt: new Date(),
				},
			}
		);

		console.log(
			`✅ Updated ${result.modifiedCount} habits with default time settings`
		);
	} catch (error: any) {
		console.error("❌ Failed:", error.message);
		process.exit(1);
	}
}

if (require.main === module) {
	fixHabitTimeSettings().then(() => {
		console.log("✨ Script completed");
		process.exit(0);
	});
}
