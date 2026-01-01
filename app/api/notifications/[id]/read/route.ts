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

		// **Check if ID is a valid MongoDB ObjectId (24 hex chars)**
		const isObjectId = /^[0-9a-fA-F]{24}$/.test(params.id);
		console.log(`🔍 ID is ObjectId: ${isObjectId}`);

		// **Check if ID is a UUID (36 chars with dashes)**
		const isUUID =
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
				params.id
			);
		console.log(`🔍 ID is UUID: ${isUUID}`);

		let query: any = {
			userId: new ObjectId(user.userId),
		};

		// **Handle different ID formats**
		if (isObjectId) {
			query._id = new ObjectId(params.id);
		} else if (isUUID) {
			// UUIDs might be stored as strings in the _id field or in a separate id field
			query.$or = [
				{ _id: params.id }, // Try as string _id
				{ id: params.id }, // Try as separate id field
			];
		} else {
			console.log("❌ Invalid ID format");
			return NextResponse.json(
				{ error: "Invalid notification ID format" },
				{ status: 400 }
			);
		}

		console.log("🔍 Query for notification:", query);

		// First, find the notification
		const notification = await db.collection("notifications").findOne(query);

		console.log("🔍 Found notification:", notification ? "Yes" : "No");
		if (notification) {
			console.log("📝 Notification details:", {
				_id: notification._id,
				_idType: typeof notification._id,
				id: notification.id,
				userId: notification.userId,
			});
		}

		if (!notification) {
			console.log("❌ Notification not found or not owned by user");
			return NextResponse.json(
				{ error: "Notification not found" },
				{ status: 404 }
			);
		}

		console.log("📝 Current read status:", notification.read);

		// Update the notification using its actual _id from the found document
		const result = await db.collection("notifications").updateOne(
			{
				_id: notification._id, // Use the actual _id from the found document
				userId: new ObjectId(user.userId),
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
			acknowledged: result.acknowledged,
		});

		if (result.matchedCount === 0) {
			console.log("❌ No notification matched the query");
			return NextResponse.json(
				{ error: "Notification not found" },
				{ status: 404 }
			);
		}

		console.log("✅ Notification marked as read successfully");

		return NextResponse.json({
			success: true,
			message: "Notification marked as read",
			read: true,
			notificationId: params.id,
		});
	} catch (error: any) {
		console.error("❌ [API] Error marking notification as read:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
