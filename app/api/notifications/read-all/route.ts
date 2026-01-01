import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		// **CORRECTED: userId is string**
		const result = await db.collection("notifications").updateMany(
			{
				userId: user.userId, // String
				read: false,
			},
			{
				$set: {
					read: true,
					updatedAt: new Date(),
				},
			}
		);

		console.log(
			`✅ Marked ${result.modifiedCount} notifications as read for user ${user.userId}`
		);

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
