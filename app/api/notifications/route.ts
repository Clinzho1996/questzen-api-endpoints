import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		console.log("🔍 Backend - Fetching notifications for user:", user.userId);
		console.log("🔍 Backend - User ID type:", typeof user.userId);
		console.log("🔍 Backend - User ID value:", user.userId);

		// Try querying in different ways
		console.log("🔍 Trying different query methods...");

		// Method 1: As string (most likely)
		const query1 = { userId: user.userId };
		console.log("📋 Query 1 (as string):", JSON.stringify(query1));
		const result1 = await db.collection("notifications").find(query1).toArray();
		console.log(`📋 Result 1: ${result1.length} notifications`);

		// Method 2: As ObjectId (if stored that way)
		try {
			const query2 = { userId: new ObjectId(user.userId) };
			console.log("📋 Query 2 (as ObjectId):", JSON.stringify(query2));
			const result2 = await db
				.collection("notifications")
				.find(query2)
				.toArray();
			console.log(`📋 Result 2: ${result2.length} notifications`);
		} catch (err) {
			console.log("📋 Query 2 failed - not a valid ObjectId");
		}

		// Method 3: Check all notifications to see what's in the database
		const allNotifications = await db
			.collection("notifications")
			.find({})
			.limit(10)
			.toArray();
		console.log("📋 All notifications in DB (first 10):");
		allNotifications.forEach((notif, index) => {
			console.log(
				`${index + 1}. _id: ${notif._id}, userId: ${notif.userId}, type: ${
					notif.type
				}`
			);
		});

		// Use the working query
		const notifications = result1; // or result2, whichever works

		console.log(
			`✅ Backend - Found ${notifications.length} notifications total`
		);

		return NextResponse.json(
			notifications.map((notif) => ({
				...notif,
				id: notif._id.toString(),
				_id: undefined,
			}))
		);
	} catch (error: any) {
		console.error("Get notifications error:", error);
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
