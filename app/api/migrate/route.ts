// app/api/migrate/route.ts
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	try {
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
			"Build my muscles", // Add your custom habit
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

		// Count total collaborative habits
		const collaborativeCount = await db.collection("habits").countDocuments({
			isCollaborative: true,
		});

		return NextResponse.json({
			success: true,
			message: "Migration completed successfully",
			stats: {
				updated: result.modifiedCount,
				madeCollaborative: collaborativeResult.modifiedCount,
				totalCollaborative: collaborativeCount,
			},
		});
	} catch (error: any) {
		console.error("❌ Migration failed:", error);
		return NextResponse.json(
			{
				error: {
					message: "Migration failed",
					details: error.message,
				},
			},
			{ status: 500 }
		);
	}
}
