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
		const params = await context.params;
		console.log("🔵 [API] Deleting notification");
		console.log("🗑️ Notification ID:", params.id);

		const user = await requireAuth(request);
		const db = await getDatabase();

		// **Check ID format**
		const isObjectId = /^[0-9a-fA-F]{24}$/.test(params.id);
		const isUUID =
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
				params.id
			);

		let query: any = {
			userId: new ObjectId(user.userId),
		};

		// **Handle different ID formats**
		if (isObjectId) {
			query._id = new ObjectId(params.id);
		} else if (isUUID) {
			query.$or = [{ _id: params.id }, { id: params.id }];
		} else {
			return NextResponse.json(
				{ error: "Invalid notification ID format" },
				{ status: 400 }
			);
		}

		console.log("🔍 Delete query:", query);

		// First find the notification to get its actual _id
		const notification = await db.collection("notifications").findOne(query);

		if (!notification) {
			console.log("❌ Notification not found");
			return NextResponse.json(
				{ error: "Notification not found" },
				{ status: 404 }
			);
		}

		// Delete using the actual _id
		const result = await db.collection("notifications").deleteOne({
			_id: notification._id,
			userId: new ObjectId(user.userId),
		});

		console.log("🗑️ Delete result:", result);

		if (result.deletedCount === 0) {
			return NextResponse.json(
				{ error: "Notification not found" },
				{ status: 404 }
			);
		}

		return NextResponse.json({
			success: true,
			message: "Notification deleted",
		});
	} catch (error: any) {
		console.error("❌ [API] Error deleting notification:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
