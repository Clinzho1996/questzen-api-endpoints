import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const { searchParams } = new URL(request.url);
		const filter = searchParams.get("filter") || "allTime";

		const db = await getDatabase();

		// Build query based on filter
		let sortField = "xp";
		let sortOrder: 1 | -1 = -1; // descending

		// For time-based filters, you'd need additional fields like weeklyXP, monthlyXP
		// For now, we'll use all-time XP
		let query = {};

		// Get top 10 users
		const users = await db
			.collection("users")
			.find(query)
			.sort({ [sortField]: sortOrder })
			.limit(10)
			.toArray();

		// Format leaderboard data
		const leaderboard = users.map((userDoc, index) => ({
			id: userDoc._id.toString(),
			userId: userDoc.firebaseUid || userDoc._id.toString(),
			name: userDoc.displayName || "Anonymous",
			avatar:
				userDoc.photoURL ||
				`https://api.dicebear.com/7.x/avataaars/svg?seed=${userDoc._id}`,
			xp: userDoc.xp || 0,
			level: userDoc.level || 1,
			completedGoals: userDoc.completedGoals || 0,
			rank: index + 1,
		}));

		// Find current user's rank
		const currentUserIndex = users.findIndex(
			(u) => u.firebaseUid === user.userId || u._id.toString() === user.userId
		);
		const userRank = currentUserIndex >= 0 ? currentUserIndex + 1 : null;

		// Add CORS headers
		const origin = request.headers.get("origin") || "";
		const allowedOrigins = [
			"https://questzenai.devclinton.org",
			"http://localhost:5173",
			"http://localhost:3000",
		];

		const response = NextResponse.json({
			success: true,
			leaderboard,
			userRank,
			filter,
		});

		if (allowedOrigins.includes(origin)) {
			response.headers.set("Access-Control-Allow-Origin", origin);
		}
		response.headers.set("Access-Control-Allow-Credentials", "true");

		return response;
	} catch (error: any) {
		console.error("Leaderboard fetch error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{ error: { message: "Server error" } },
			{ status: 500 }
		);
	}
}

export async function OPTIONS(request: NextRequest) {
	const origin = request.headers.get("origin") || "http://localhost:5173";
	const allowedOrigins = [
		"https://questzenai.devclinton.org",
		"http://localhost:5173",
		"http://localhost:3000",
	];

	const response = new NextResponse(null, { status: 200 });

	if (allowedOrigins.includes(origin)) {
		response.headers.set("Access-Control-Allow-Origin", origin);
	}
	response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
	response.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization"
	);
	response.headers.set("Access-Control-Allow-Credentials", "true");
	response.headers.set("Access-Control-Max-Age", "86400");
	response.headers.set("Cache-Control", "no-store, max-age=0");

	return response;
}
