import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	try {
		console.log("🔵 [API] Fetching notifications");

		// Authenticate user
		const user = await requireAuth(request);
		console.log("👤 User ID:", user.userId);

		// Get database connection
		const db = await getDatabase();

		// Fetch notifications for this user
		const notifications = await db
			.collection("notifications")
			.find({
				userId: new ObjectId(user.userId),
			})
			.sort({ createdAt: -1 })
			.toArray();

		console.log(`✅ Found ${notifications.length} notifications from database`);

		// Log each notification's read status for debugging
		notifications.forEach((notif, index) => {
			console.log(
				`  ${index + 1}. ID: ${notif._id}, Read: ${notif.read}, Title: ${
					notif.title
				}`
			);
		});

		// Count unread notifications
		const unreadCount = notifications.filter((n) => !n.read).length;
		console.log(`📊 Unread notifications: ${unreadCount}`);

		// Transform the data to match frontend expectations
		const transformedNotifications = notifications.map((notif) => ({
			id: notif._id.toString(),
			type: notif.type || "system",
			title: notif.title || "Notification",
			message: notif.message || notif.content || "",
			read: notif.read || false,
			createdAt: notif.createdAt,
			updatedAt: notif.updatedAt,
			actionUrl: notif.actionUrl,
			icon: notif.icon,
		}));

		return NextResponse.json(transformedNotifications);
	} catch (error: any) {
		console.error("❌ [API] Error fetching notifications:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
