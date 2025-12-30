import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";
export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		// Get notifications sorted by createdAt DESC (newest first)
		const notifications = await db
			.collection("notifications")
			.find({
				userId: user.userId,
			})
			.sort({
				createdAt: -1, // -1 means descending (newest first)
			})
			.limit(50)
			.toArray();

		console.log(
			`✅ Found ${notifications.length} notifications, sorted newest first`
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

// Add this as a temporary test route in your backend
export async function POST(request: NextRequest) {
	try {
		const { userId } = await request.json();
		const db = await getDatabase();

		console.log("🧪 Test query for userId:", userId);

		// Query as string
		const notifications = await db
			.collection("notifications")
			.find({
				userId: userId,
			})
			.toArray();

		console.log(`🧪 Found ${notifications.length} notifications`);

		return NextResponse.json({
			userId,
			count: notifications.length,
			notifications: notifications,
		});
	} catch (error: any) {
		console.error("Test error:", error);
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}
