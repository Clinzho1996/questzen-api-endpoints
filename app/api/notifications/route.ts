import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		// **CORRECTED: userId is stored as string in your database**
		const notifications = await db
			.collection("notifications")
			.find({
				userId: user.userId, // String, not ObjectId
			})
			.sort({ createdAt: -1 })
			.toArray();

		console.log(
			`✅ Found ${notifications.length} notifications for user ${user.userId}`
		);

		// Transform data, ensuring consistent ID field
		const transformedNotifications = notifications.map((notif) => {
			// Convert _id to string regardless of format
			let id: string;

			if (notif._id instanceof ObjectId) {
				id = notif._id.toString();
			} else {
				id = String(notif._id);
			}

			return {
				id: id,
				type: notif.type || "system",
				title: notif.title || "Notification",
				message: notif.message || notif.content || "",
				read: notif.read !== undefined ? notif.read : false,
				createdAt: notif.createdAt,
				updatedAt: notif.updatedAt,
				actionUrl: notif.actionUrl,
				icon: notif.icon,
			};
		});

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
