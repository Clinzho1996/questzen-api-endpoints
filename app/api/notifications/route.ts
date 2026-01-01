import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	try {
		console.log("🔵 [API] Fetching notifications");

		const user = await requireAuth(request);
		console.log("👤 User ID:", user.userId);

		const db = await getDatabase();

		// **Try multiple query methods to find notifications**
		let notifications = [];

		try {
			// Method 1: Try with ObjectId
			const userIdObj = new ObjectId(user.userId);
			notifications = await db
				.collection("notifications")
				.find({
					userId: userIdObj,
				})
				.sort({ createdAt: -1 })
				.toArray();

			console.log(
				`🔍 Query with ObjectId found: ${notifications.length} notifications`
			);

			// Method 2: If no results, try with string userId
			if (notifications.length === 0) {
				console.log("🔄 Trying query with string userId...");
				notifications = await db
					.collection("notifications")
					.find({
						userId: user.userId, // String userId
					})
					.sort({ createdAt: -1 })
					.toArray();

				console.log(
					`🔍 Query with string userId found: ${notifications.length} notifications`
				);
			}

			// Method 3: If still no results, try case-insensitive match
			if (notifications.length === 0) {
				console.log("🔄 Trying case-insensitive string match...");
				notifications = await db
					.collection("notifications")
					.find({
						userId: { $regex: new RegExp(`^${user.userId}$`, "i") },
					})
					.sort({ createdAt: -1 })
					.toArray();

				console.log(
					`🔍 Case-insensitive query found: ${notifications.length} notifications`
				);
			}
		} catch (queryError) {
			console.error("❌ Query error:", queryError);

			// Fallback: try direct string match
			notifications = await db
				.collection("notifications")
				.find({
					userId: user.userId,
				})
				.sort({ createdAt: -1 })
				.toArray();

			console.log(
				`🔍 Fallback query found: ${notifications.length} notifications`
			);
		}

		console.log(`✅ Total notifications found: ${notifications.length}`);

		// **Debug: Log sample notification structure**
		if (notifications.length > 0) {
			const sample = notifications[0];
			console.log("🔍 Sample notification structure:", {
				keys: Object.keys(sample),
				hasUserId: "userId" in sample,
				userId: sample.userId,
				userIdType: typeof sample.userId,
				isObjectId: sample.userId instanceof ObjectId,
				hasRead: "read" in sample,
				read: sample.read,
			});
		}

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

			// **Debug: Log each notification's ID**
			console.log(
				`📝 Processing notification: ID=${id}, Type=${notif.type}, Read=${notif.read}`
			);

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
				// Add raw userId for debugging
				_rawUserId: notif.userId,
				_rawUserIdType: typeof notif.userId,
			};
		});

		return NextResponse.json(transformedNotifications);
	} catch (error: any) {
		console.error("❌ [API] Error fetching notifications:", error);
		console.error("❌ Error stack:", error.stack);

		if (error.message === "Unauthorized") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
