// app/api/users/active-emails/route.ts
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		// Fetch all active users from MongoDB
		const activeUsers = await db
			.collection("users")
			.find({}, { projection: { email: 1, firebaseUid: 1, _id: 1 } })
			.toArray();

		// Extract emails and IDs
		const activeEmails = activeUsers
			.map((user) => user.email?.toLowerCase().trim())
			.filter(Boolean);

		const activeUserIds = activeUsers
			.map((user) => user.firebaseUid || user._id?.toString())
			.filter(Boolean);

		console.log(`📧 Found ${activeEmails.length} active emails in MongoDB`);
		console.log(`🆔 Found ${activeUserIds.length} active user IDs in MongoDB`);

		return NextResponse.json({
			success: true,
			activeEmails,
			activeUserIds,
			count: activeUsers.length,
		});
	} catch (error: any) {
		console.error("❌ Error fetching active emails:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
