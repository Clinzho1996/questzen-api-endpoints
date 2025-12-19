import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const user = await requireAuth(request);
		const params = await context.params; // Await the params
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
				},
			}
		);

		return NextResponse.json({
			message: "Notification updated",
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

		console.error("Update notification error:", error);
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

export async function DELETE(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const user = await requireAuth(request);
		const params = await context.params; // Await the params
		const db = await getDatabase();

		await db.collection("notifications").deleteOne({
			_id: new ObjectId(params.id),
			userId: new ObjectId(user.userId),
		});

		return NextResponse.json({
			message: "Notification deleted",
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

		console.error("Delete notification error:", error);
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
