import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
	request: NextRequest,
	{ params }: { params: { id: string } }
) {
	try {
		console.log("🔵 [API] Marking notification as read");
		console.log("📝 Notification ID:", params.id);

		// Authenticate user
		const user = await requireAuth(request);
		console.log("👤 User ID:", user.userId);

		// Get database connection
		const db = await getDatabase();

		// Validate notification ID
		if (!ObjectId.isValid(params.id)) {
			console.log("❌ Invalid notification ID format:", params.id);
			return NextResponse.json(
				{ error: "Invalid notification ID" },
				{ status: 400 }
			);
		}

		const notificationId = new ObjectId(params.id);
		const userId = new ObjectId(user.userId);

		console.log("🔍 Querying for notification:", {
			_id: notificationId,
			userId: userId,
		});

		// First, let's check if the notification exists
		const notification = await db.collection("notifications").findOne({
			_id: notificationId,
			userId: userId,
		});

		console.log("🔍 Found notification:", notification);

		if (!notification) {
			console.log("❌ Notification not found or not owned by user");
			return NextResponse.json(
				{ error: "Notification not found" },
				{ status: 404 }
			);
		}

		console.log("📝 Current read status:", notification.read);

		// Update the notification
		const result = await db.collection("notifications").updateOne(
			{
				_id: notificationId,
				userId: userId,
			},
			{
				$set: {
					read: true,
					updatedAt: new Date(),
				},
			}
		);

		console.log("📝 MongoDB Update result:", {
			matchedCount: result.matchedCount,
			modifiedCount: result.modifiedCount,
			upsertedCount: result.upsertedCount,
			acknowledged: result.acknowledged,
		});

		if (result.matchedCount === 0) {
			console.log("❌ No notification matched the query");
			return NextResponse.json(
				{ error: "Notification not found" },
				{ status: 404 }
			);
		}

		if (result.modifiedCount === 0) {
			console.log("⚠️ Notification was already marked as read");
			// This is okay - we still return success
		}

		console.log("✅ Notification marked as read successfully");

		// Verify the update by fetching the updated document
		const updatedNotification = await db.collection("notifications").findOne({
			_id: notificationId,
			userId: userId,
		});

		console.log("✅ Verified updated read status:", updatedNotification?.read);

		return NextResponse.json({
			success: true,
			message: "Notification marked as read",
			read: true,
			notificationId: params.id,
		});
	} catch (error: any) {
		console.error("❌ [API] Error marking notification as read:", error);
		console.error("❌ Error stack:", error.stack);

		if (error.message === "Unauthorized") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		return NextResponse.json(
			{
				error: "Internal server error",
				details: error.message,
			},
			{ status: 500 }
		);
	}
}
