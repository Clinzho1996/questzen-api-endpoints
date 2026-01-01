import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const user = await requireAuth(request);
		const params = await context.params;
		const body = await request.json();
		const db = await getDatabase();

		await db.collection("notifications").updateOne(
			{
				_id: new ObjectId(params.id),
				userId: new ObjectId(user.userId),
			},
			{
				$set: {
					read: body.read !== undefined ? body.read : true,
					updatedAt: new Date(),
				},
			}
		);

		return NextResponse.json({
			message: "Notification marked as read",
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

		console.error("Mark as read error:", error);
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
