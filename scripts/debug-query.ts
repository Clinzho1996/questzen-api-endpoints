import { getDatabase } from "@/lib/mongodb";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

async function debugQuery() {
	console.log("🔍 Debugging cron query...");

	if (!process.env.MONGODB_URI) {
		console.error("❌ MONGODB_URI is not defined");
		process.exit(1);
	}

	try {
		const db = await getDatabase();
		const habitsCollection = db.collection("habits");

		// Test different queries
		const queries = [
			{ name: "isActive only", query: { isActive: true } },
			{
				name: "reminders.enabled",
				query: { "settings.reminders.enabled": true },
			},
			{
				name: "has reminders object",
				query: { "settings.reminders": { $exists: true } },
			},
			{
				name: "any field named reminders",
				query: {
					$or: [
						{ "settings.reminders": { $exists: true } },
						{ reminders: { $exists: true } },
						{ reminderSettings: { $exists: true } },
					],
				},
			},
		];

		for (const { name, query } of queries) {
			const count = await habitsCollection.countDocuments(query);
			console.log(`📊 ${name}: ${count} habits`);

			if (count > 0) {
				const sample = await habitsCollection.findOne(query, {
					projection: { name: 1, settings: 1, isActive: 1 },
				});
				console.log(`   Sample:`, JSON.stringify(sample, null, 2));
			}
		}

		// Get total habits
		const total = await habitsCollection.countDocuments({});
		console.log(`\n📊 Total habits: ${total}`);

		// Get one habit's full structure
		const anyHabit = await habitsCollection.findOne({});
		console.log("\n🔍 One habit's structure:");
		console.log(JSON.stringify(anyHabit, null, 2));
	} catch (error: any) {
		console.error("❌ Failed:", error.message);
		process.exit(1);
	}
}

if (require.main === module) {
	debugQuery().then(() => {
		console.log("✨ Debug completed");
		process.exit(0);
	});
}
