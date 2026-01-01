import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		await db.collection("notifications").updateMany(
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

		return NextResponse.json({
			message: "All notifications marked as read",
		});
	} catch (error: any) {
		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{
					error: {
						message: "Unauthorized",
					},
				},
				{
					status: 401,
				}
			);
		}

		console.error("Mark all as read error:", error);
		return NextResponse.json(
			{
				error: {
					message: "Server error",
				},
			},
			{
				status: 500,
			}
		);
	}
}
