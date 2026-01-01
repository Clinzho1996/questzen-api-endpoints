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

		// **IMPROVED: Transform with provider information**
		const transformedMongoUsers: UnifiedUser[] = mongoUsers.map((userDoc) => {
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
				xp: userDoc.xp || 0,
				level: userDoc.level || 1,
				completedGoals: userDoc.completedGoals || 0,
				source: "mongodb" as const,
				email: userDoc.email,
				displayName: userDoc.displayName,
				photoURL: userDoc.photoURL,
				provider: provider,
			};
		});

		// **IMPROVED: Remove duplicates by email + provider**
		const uniqueUsers = removeDuplicates(transformedMongoUsers);

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
		// **KEY FIX: Use email + provider as unique key**
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

	// Log duplicates found
	if (users.length > seen.size) {
		console.log("⚠️ Removed duplicates:");
		const emailCounts = new Map<string, number>();
		users.forEach((u) => {
			const email = u.email?.toLowerCase().trim() || "no-email";
			emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
		});

		emailCounts.forEach((count, email) => {
			if (count > 1) {
				console.log(`   ${email}: ${count} entries`);
			}
		});
	}

	return Array.from(seen.values());
}

function applyTimeFilter(users: UnifiedUser[], filter: string): UnifiedUser[] {
	// For now, return all users
	// You can implement time-based filtering later
	return users;
}
