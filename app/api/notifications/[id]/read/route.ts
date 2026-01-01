import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		console.log("🔵 [API] Marking notification as read");
		const params = await context.params;
		console.log("📝 Notification ID:", params.id);

		const user = await requireAuth(request);
		console.log("👤 User ID:", user.userId);

		const db = await getDatabase();

		// Check ID format
		const isObjectId = /^[0-9a-fA-F]{24}$/.test(params.id);
		const isUUID =
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
				params.id
			);

		console.log(`🔍 ID is ObjectId: ${isObjectId}, is UUID: ${isUUID}`);

		// **CORRECTED: Build query based on your database structure**
		let idQuery: any = {};

		if (isObjectId) {
			// For ObjectId _id
			idQuery._id = new ObjectId(params.id);
		} else if (isUUID) {
			// For UUID _id (stored as string)
			idQuery._id = params.id;
		} else {
			return NextResponse.json(
				{ error: "Invalid notification ID format" },
				{ status: 400 }
			);
		}

		// **IMPORTANT: userId is stored as STRING in your database**
		idQuery.userId = user.userId; // String comparison, not ObjectId

		console.log("🔍 Final query:", JSON.stringify(idQuery, null, 2));

		// Update the notification
		const result = await db.collection("notifications").updateOne(idQuery, {
			$set: {
				read: true,
				updatedAt: new Date(),
			},
		});

		console.log("📝 MongoDB Update result:", {
			matchedCount: result.matchedCount,
			modifiedCount: result.modifiedCount,
			acknowledged: result.acknowledged,
		});

		if (result.matchedCount === 0) {
			console.log("❌ No notification matched the query");
			console.log("🔍 Query was:", idQuery);

			// Let's check if the notification exists at all
			const existsCheck = await db.collection("notifications").findOne({
				$or: [{ _id: new ObjectId(params.id) }, { _id: params.id }],
			});

			console.log("🔍 Exists check:", existsCheck ? "Found" : "Not found");
			if (existsCheck) {
				console.log("🔍 Found notification but wrong user:", {
					notificationUserId: existsCheck.userId,
					requestUserId: user.userId,
					match: existsCheck.userId === user.userId,
				});
			}

			return NextResponse.json(
				{ error: "Notification not found or not owned by user" },
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
