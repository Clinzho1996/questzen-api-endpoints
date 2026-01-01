// app/api/leaderboard/route.ts
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

interface LeaderboardUser {
	id: string;
	userId: string;
	name: string;
	avatar: string;
	xp: number;
	level: number;
	completedHabits: number; // Changed from completedGoals
	source: "firebase" | "mongodb";
	email?: string;
	displayName?: string;
	photoURL?: string;
	provider?: string;
}

interface UserDocument {
	_id?: any;
	firebaseUid?: string;
	email?: string;
	displayName?: string;
	photoURL?: string;
	xp?: number;
	level?: number;
	completedHabits?: number; // Updated field name
	completedGoals?: number; // Keep for backward compatibility
	provider?: string;
	password?: string;
	xpHistory?: Array<{
		date: Date;
		amount: number;
		source: string;
	}>;
	createdAt?: Date;
	updatedAt?: Date;
	lastActiveDate?: Date; // Added for activity-based filtering
}

export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		const url = new URL(request.url);
		const filter = url.searchParams.get("filter") || "allTime";

		console.log("📊 Fetching unified leaderboard, filter:", filter);

		// Get date range based on filter
		const dateRange = getDateRange(filter);
		console.log("📅 Date range for filter:", {
			filter,
			start: dateRange.start?.toISOString(),
			end: dateRange.end?.toISOString(),
		});

		// Fetch MongoDB users with necessary fields
		const mongoUsers = await db
			.collection("users")
			.find({})
			.sort({ xp: -1 })
			.limit(100)
			.project({
				_id: 1,
				email: 1,
				displayName: 1,
				photoURL: 1,
				firebaseUid: 1,
				xp: 1,
				level: 1,
				completedHabits: 1,
				completedGoals: 1,
				provider: 1,
				password: 1,
				xpHistory: 1,
				createdAt: 1,
				updatedAt: 1,
				lastActiveDate: 1,
			})
			.toArray();

		console.log(`📦 Found ${mongoUsers.length} MongoDB users`);

		// Transform users with time filtering
		const transformedMongoUsers: LeaderboardUser[] = mongoUsers
			.map((userDoc: UserDocument) => {
				// Calculate XP for the selected time period
				const xpForPeriod = calculateXPForPeriod(userDoc, dateRange);

				// For non-allTime filters, skip users with 0 XP in period
				if (filter !== "allTime" && xpForPeriod === 0) {
					return null;
				}

				// Determine provider
				let provider = "email"; // Default
				if (userDoc.provider) {
					provider = userDoc.provider;
				} else if (userDoc.firebaseUid) {
					provider = "firebase";
				} else if (userDoc.password) {
					provider = "email";
				}

				// Use completedHabits if available, fallback to completedGoals
				const completedHabits =
					userDoc.completedHabits !== undefined
						? userDoc.completedHabits
						: userDoc.completedGoals || 0;

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
					completedHabits,
					source: "mongodb" as const,
					email: userDoc.email,
					displayName: userDoc.displayName,
					photoURL: userDoc.photoURL,
					provider: provider,
				};
			})
			.filter(Boolean) as LeaderboardUser[];

		console.log(
			`✅ ${transformedMongoUsers.length} users after time filtering`
		);

		// Remove duplicates
		const uniqueUsers = removeDuplicates(transformedMongoUsers);
		console.log(`🔍 After deduplication: ${uniqueUsers.length} users`);

		// Sort by XP (for the selected period)
		const sortedUsers = uniqueUsers.sort((a, b) => b.xp - a.xp);
		const topUsers = sortedUsers.slice(0, 50);

		console.log(
			`🏆 Returning top ${topUsers.length} users for ${filter} period`
		);

		// Log top 3 for debugging
		if (topUsers.length > 0) {
			console.log("Top 3 users:");
			topUsers.slice(0, 3).forEach((user, index) => {
				console.log(
					`${index + 1}. ${user.name}: ${user.xp} XP (${user.email})`
				);
			});
		}

		return NextResponse.json({
			success: true,
			leaderboard: topUsers,
			count: topUsers.length,
			filter,
			dateRange: {
				start: dateRange.start?.toISOString(),
				end: dateRange.end?.toISOString(),
			},
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

// Helper function to get date range
function getDateRange(filter: string): {
	start: Date | null;
	end: Date | null;
} {
	const now = new Date();

	switch (filter) {
		case "week":
			// Last 7 days
			const weekAgo = new Date(now);
			weekAgo.setDate(now.getDate() - 7);
			return { start: weekAgo, end: now };

		case "month":
			// Last 30 days
			const monthAgo = new Date(now);
			monthAgo.setDate(now.getDate() - 30);
			return { start: monthAgo, end: now };

		case "allTime":
		default:
			return { start: null, end: null };
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

	// Option 1: Use XP history if available
	if (userDoc.xpHistory && Array.isArray(userDoc.xpHistory)) {
		const xpInPeriod = userDoc.xpHistory
			.filter((entry) => {
				const entryDate = new Date(entry.date);
				return entryDate >= dateRange.start! && entryDate <= dateRange.end!;
			})
			.reduce((sum, entry) => sum + (entry.amount || 0), 0);

		return xpInPeriod;
	}

	// Option 2: Use lastActiveDate if available
	if (userDoc.lastActiveDate) {
		const lastActive = new Date(userDoc.lastActiveDate);
		if (lastActive >= dateRange.start! && lastActive <= dateRange.end!) {
			// User was active in this period, return their total XP
			// Note: This overestimates but works for MVP
			return userDoc.xp || 0;
		}
	}

	// Option 3: Use updatedAt timestamp
	if (userDoc.updatedAt) {
		const updatedAt = new Date(userDoc.updatedAt);
		if (updatedAt >= dateRange.start! && updatedAt <= dateRange.end!) {
			return userDoc.xp || 0;
		}
	}

	// Option 4: Use createdAt timestamp (for new users)
	if (userDoc.createdAt) {
		const createdAt = new Date(userDoc.createdAt);
		if (createdAt >= dateRange.start! && createdAt <= dateRange.end!) {
			return userDoc.xp || 0;
		}
	}

	// User hasn't been active in this period
	return 0;
}

function removeDuplicates(users: LeaderboardUser[]): LeaderboardUser[] {
	const seen = new Map<string, LeaderboardUser>();

	users.forEach((user) => {
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

	return Array.from(seen.values());
}
