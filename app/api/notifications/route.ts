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
		const notificationsCollection = db.collection("notifications");

		let notifications = [];
		let queryMethod = "";

		// Try multiple query methods to find notifications
		try {
			// Method 1: Try with ObjectId
			const userIdObj = new ObjectId(user.userId);
			notifications = await notificationsCollection
				.find({
					userId: userIdObj,
				})
				.sort({ createdAt: -1 })
				.toArray();

			queryMethod = "ObjectId";
			console.log(
				`🔍 Query method: ${queryMethod}, Found: ${notifications.length}`
			);

			// If no results, try Method 2: string userId
			if (notifications.length === 0) {
				notifications = await notificationsCollection
					.find({
						userId: user.userId,
					})
					.sort({ createdAt: -1 })
					.toArray();

				queryMethod = "String";
				console.log(
					`🔍 Query method: ${queryMethod}, Found: ${notifications.length}`
				);
			}

			// If still no results, try Method 3: case-insensitive string match
			if (notifications.length === 0) {
				// Check if there are any notifications at all
				const allNotifications = await notificationsCollection
					.find({})
					.toArray();
				console.log(
					`🔍 Total notifications in collection: ${allNotifications.length}`
				);

				// Check if userId might be stored differently
				if (allNotifications.length > 0) {
					const sample = allNotifications[0];
					console.log("🔍 Sample notification structure:", {
						keys: Object.keys(sample),
						userId: sample.userId,
						userIdType: typeof sample.userId,
						isObjectId: sample.userId instanceof ObjectId,
					});
				}
			}
		} catch (error) {
			console.error("❌ Query error:", error);

			// Fallback: try direct string match
			notifications = await notificationsCollection
				.find({
					userId: user.userId,
				})
				.sort({ createdAt: -1 })
				.toArray();

			queryMethod = "Fallback String";
			console.log(
				`🔍 Query method: ${queryMethod}, Found: ${notifications.length}`
			);
		}

		console.log(
			`✅ Found ${notifications.length} notifications using ${queryMethod} query`
		);

		// Log each notification for debugging
		notifications.forEach((notif, index) => {
			console.log(
				`  ${index + 1}. ID: ${notif._id}, UserId: ${notif.userId}, Read: ${
					notif.read
				}, Title: ${notif.title}`
			);
		});

		// Transform the data
		const transformedNotifications = notifications.map((notif) => ({
			id: notif._id?.toString(),
			type: notif.type || "system",
			title: notif.title || "Notification",
			message: notif.message || notif.content || "",
			read: notif.read !== undefined ? notif.read : false, // Handle missing read field
			createdAt: notif.createdAt || new Date(),
			updatedAt: notif.updatedAt,
			actionUrl: notif.actionUrl,
			icon: notif.icon,
			// Include raw data for debugging
			_raw: {
				userId: notif.userId,
				userIdType: typeof notif.userId,
			},
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
