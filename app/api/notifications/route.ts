import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		const notifications = await db
			.collection("notifications")
			.find({
				userId: new ObjectId(user.userId),
			})
			.sort({ createdAt: -1 })
			.toArray();

		// Transform data, ensuring consistent ID field
		const transformedNotifications = notifications.map((notif) => {
			// **Always return string ID in 'id' field**
			let id: string;

			if (notif._id instanceof ObjectId) {
				id = notif._id.toString(); // Convert ObjectId to string
			} else if (typeof notif._id === "string") {
				id = notif._id; // Already a string (UUID)
			} else if (notif.id) {
				id = notif.id; // Use separate id field
			} else {
				id = "unknown-id"; // Fallback
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
