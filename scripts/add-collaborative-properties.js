// scripts/add-collaborative-properties.js
import { getDatabase } from "@/lib/mongodb";

async function migrateHabits() {
	const db = await getDatabase();

	console.log("🔄 Adding collaborative properties to existing habits...");

	// Update all habits to include collaborative properties
	const result = await db.collection("habits").updateMany(
		{
			$or: [
				{ isCollaborative: { $exists: false } },
				{ collaborators: { $exists: false } },
				{ participants: { $exists: false } },
			],
		},
		{
			$set: {
				isCollaborative: false,
				collaborators: [],
				participants: [],
			},
		}
	);

	console.log(`✅ Updated ${result.modifiedCount} habits`);

	// Now mark some habits as collaborative for testing
	const collaborativeHabitNames = [
		"Morning Gratitude",
		"Morning Yoga",
		"Exercise",
		"Socialize",
		"Call a Friend",
	];

	const collaborativeResult = await db.collection("habits").updateMany(
		{
			name: { $in: collaborativeHabitNames },
		},
		{
			$set: {
				isCollaborative: true,
			},
		}
	);

	console.log(
		`✅ Marked ${collaborativeResult.modifiedCount} habits as collaborative`
	);
}

// Run the migration
migrateHabits()
	.then(() => {
		console.log("🎉 Migration completed successfully!");
		process.exit(0);
	})
	.catch((error) => {
		console.error("❌ Migration failed:", error);
		process.exit(1);
	});
