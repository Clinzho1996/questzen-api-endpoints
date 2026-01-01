import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		const result = await db.collection("notifications").updateMany(
			{
				userId: new ObjectId(user.userId),
				read: false,
			},
			{
				$set: {
					read: true,
					updatedAt: new Date(),
				},
			}
		);

		console.log(`✅ Marked ${result.modifiedCount} notifications as read`);

		return NextResponse.json({
			success: true,
			message: `Marked ${result.modifiedCount} notifications as read`,
			count: result.modifiedCount,
		});
	} catch (error: any) {
		console.error("❌ [API] Error marking all as read:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
