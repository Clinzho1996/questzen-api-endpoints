// app/api/leaderboard/route.ts
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

interface UnifiedUser {
	id: string;
	userId: string;
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

interface UserDocument {
	_id: any;
	firebaseUid?: string;
	email?: string;
	displayName?: string;
	photoURL?: string;
	xp?: number;
	level?: number;
	completedGoals?: number;
	provider?: string;
	password?: string;
	// XP history for time filtering
	xpHistory?: Array<{
		date: Date;
		amount: number;
		source: string;
	}>;
	createdAt?: Date;
	updatedAt?: Date;
}

export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		const url = new URL(request.url);
		const filter = url.searchParams.get("filter") || "allTime";

		console.log("📊 Fetching unified leaderboard, filter:", filter);

		// Get date ranges based on filter
		const dateRange = getDateRange(filter);

		// Fetch MongoDB users with their XP history
		const mongoUsers = await db
			.collection("users")
			.find({})
			.sort({ xp: -1 })
			.limit(100) // Fetch more for filtering
			.toArray();

		// Transform users and calculate XP for the time period
		const transformedMongoUsers: UnifiedUser[] = mongoUsers
			.map((userDoc: UserDocument) => {
				// Calculate XP for the time period
				const xpForPeriod = calculateXPForPeriod(userDoc, dateRange);

				// Skip users with 0 XP for the period
				if (xpForPeriod === 0 && filter !== "allTime") {
					return null;
				}

				// Determine provider
				let provider = "email"; // Default
				if (userDoc.provider) {
					provider = userDoc.provider;
				} else if (userDoc.firebaseUid) {
					provider = "google"; // Firebase users from Google
				} else if (userDoc.password) {
					provider = "email"; // Has password = email signup
				}

				return {
					id: userDoc._id.toString(),
					userId: userDoc.firebaseUid || userDoc._id.toString(),
					name:
						userDoc.displayName || userDoc.email?.split("@")[0] || "Anonymous",
					avatar:
						userDoc.photoURL ||
						`https://api.dicebear.com/7.x/avataaars/svg?seed=${userDoc._id}`,
					xp: filter === "allTime" ? userDoc.xp || 0 : xpForPeriod,
					level: userDoc.level || 1,
					completedGoals: userDoc.completedGoals || 0,
					source: "mongodb" as const,
					email: userDoc.email,
					displayName: userDoc.displayName,
					photoURL: userDoc.photoURL,
					provider: provider,
				};
			})
			.filter(Boolean) as UnifiedUser[];

		// Remove duplicates by email + provider
		const uniqueUsers = removeDuplicates(transformedMongoUsers);

		// Sort by XP (for the selected period)
		const sortedUsers = uniqueUsers.sort((a, b) => b.xp - a.xp);

		console.log(
			`✅ Returning ${sortedUsers.length} users for ${filter} period`
		);

		return NextResponse.json({
			success: true,
			leaderboard: sortedUsers.slice(0, 50), // Return top 50
			count: sortedUsers.length,
			filter,
			dateRange,
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

// Helper function to get date range based on filter
function getDateRange(filter: string): {
	start: Date | null;
	end: Date | null;
} {
	const now = new Date();

	switch (filter) {
		case "week":
			// Start of week (Monday)
			const startOfWeek = new Date(now);
			startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
			startOfWeek.setHours(0, 0, 0, 0);
			return { start: startOfWeek, end: now };

		case "month":
			// Start of month
			const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
			return { start: startOfMonth, end: now };

		case "allTime":
		default:
			return { start: null, end: null }; // No time restriction
	}
}

// Calculate XP earned in a specific time period
function calculateXPForPeriod(
	userDoc: UserDocument,
	dateRange: { start: Date | null; end: Date | null }
): number {
	// If no date range (allTime), return total XP
	if (!dateRange.start || !dateRange.end) {
		return userDoc.xp || 0;
	}

	// If user has XP history, calculate from it
	if (userDoc.xpHistory && Array.isArray(userDoc.xpHistory)) {
		const xpInPeriod = userDoc.xpHistory
			.filter((entry) => {
				const entryDate = new Date(entry.date);
				return entryDate >= dateRange.start! && entryDate <= dateRange.end!;
			})
			.reduce((sum, entry) => sum + (entry.amount || 0), 0);

		return xpInPeriod;
	}

	// If no XP history, estimate based on user creation/update time
	// This is a fallback - you should implement XP history tracking
	if (userDoc.createdAt) {
		const createdAt = new Date(userDoc.createdAt);
		if (createdAt >= dateRange.start! && createdAt <= dateRange.end!) {
			// User created in this period, return their total XP
			return userDoc.xp || 0;
		}
	}

	// User exists but no activity in this period
	return 0;
}

function removeDuplicates(users: UnifiedUser[]): UnifiedUser[] {
	const seen = new Map<string, UnifiedUser>();

	users.forEach((user) => {
		// Use email + provider as unique key
		const email = user.email?.toLowerCase().trim();
		const provider = user.provider || "unknown";

		let key: string;

		if (email && provider) {
			key = `${email}::${provider}`;
		} else if (email) {
			key = email;
		} else if (user.userId) {
			key = user.userId;
		} else {
			key = user.id;
		}

		if (!seen.has(key)) {
			seen.set(key, user);
		} else {
			// Keep the one with higher XP
			const existing = seen.get(key)!;
			if (user.xp > existing.xp) {
				seen.set(key, user);
			}
		}
	});

	console.log(`🔍 Deduplication: ${users.length} → ${seen.size} users`);

	return Array.from(seen.values());
}
