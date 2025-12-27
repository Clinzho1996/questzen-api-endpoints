import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

interface UnifiedUser {
	id: string;
	userId: string; // Firebase UID or MongoDB ID
	name: string;
	avatar: string;
	xp: number;
	level: number;
	completedGoals: number;
	source: "firebase" | "mongodb";
	email?: string;
	displayName?: string;
	photoURL?: string;
	provider?: string;
}

export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		const url = new URL(request.url);
		const filter = url.searchParams.get("filter") || "allTime";

		console.log("📊 Fetching unified leaderboard, filter:", filter);

		// Fetch MongoDB users
		const mongoUsers = await db
			.collection("users")
			.find({})
			.sort({ xp: -1 })
			.limit(50)
			.toArray();

		// Transform MongoDB users
		const transformedMongoUsers: UnifiedUser[] = mongoUsers.map((userDoc) => ({
			id: userDoc._id.toString(),
			userId: userDoc.firebaseUid || userDoc._id.toString(),
			name: userDoc.displayName || userDoc.email?.split("@")[0] || "Anonymous",
			avatar:
				userDoc.photoURL ||
				`https://api.dicebear.com/7.x/avataaars/svg?seed=${userDoc._id}`,
			xp: userDoc.xp || 0,
			level: userDoc.level || 1,
			completedGoals: userDoc.completedGoals || 0,
			source: "mongodb" as const,
			email: userDoc.email,
			displayName: userDoc.displayName,
			photoURL: userDoc.photoURL,
			provider: userDoc.provider || "email",
		}));

		// We'll need to get Firebase users too
		// Since we can't directly query Firebase from Next.js backend,
		// we'll rely on the frontend to fetch Firebase users and combine them

		const allUsers = [...transformedMongoUsers];

		// Remove duplicates based on firebaseUid or email
		const uniqueUsers = removeDuplicates(allUsers);

		// Sort by XP
		const sortedUsers = uniqueUsers.sort((a, b) => b.xp - a.xp);

		// Apply time filter logic if needed
		const filteredUsers = applyTimeFilter(sortedUsers, filter);

		console.log(`✅ Returning ${filteredUsers.length} unified users`);

		return NextResponse.json({
			success: true,
			leaderboard: filteredUsers,
			count: filteredUsers.length,
			filter,
		});
	} catch (error: any) {
		console.error("❌ Leaderboard error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{
				error: {
					message: "Server error",
					details: error.message,
				},
			},
			{ status: 500 }
		);
	}
}

function removeDuplicates(users: UnifiedUser[]): UnifiedUser[] {
	const seen = new Map<string, UnifiedUser>();

	users.forEach((user) => {
		// Try to use firebaseUid first, then email, then id
		const key = user.userId || user.email || user.id;

		if (key && !seen.has(key)) {
			seen.set(key, user);
		} else if (key && seen.has(key)) {
			// Keep the one with higher XP
			const existing = seen.get(key)!;
			if (user.xp > existing.xp) {
				seen.set(key, user);
			}
		}
	});

	return Array.from(seen.values());
}

function applyTimeFilter(users: UnifiedUser[], filter: string): UnifiedUser[] {
	// For now, return all users
	// You can implement time-based filtering later
	return users;
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
