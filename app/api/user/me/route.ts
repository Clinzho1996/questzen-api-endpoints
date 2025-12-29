import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId, WithId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

/* =======================
   Types
======================= */

interface UserDocument {
	_id: ObjectId;
	firebaseUid: string;
	email: string;
	displayName?: string;
	photoURL?: string;
	subscriptionTier?: string;
	streak?: number;
	longestStreak?: number;
	totalFocusMinutes?: number;
	level?: number;
	xp?: number;
	achievements?: unknown[];
	stripeCustomerId?: string;
	stripeSubscriptionId?: string;
	subscriptionStatus?: string;
	currentPeriodEnd?: Date;
	password?: string;
	updatedAt?: Date;
	createdAt?: Date;
	// Add these if they exist in your schema
	completedGoals?: number;
	focusSessions?: number;
}

interface AuthUser {
	userId: string;
	email?: string;
}

/* =======================
   Helper Functions
======================= */

function getCorsHeaders(origin: string | null): Headers {
	const headers = new Headers();
	const allowedOrigins = [
		"https://questzenai.devclinton.org",
		"http://localhost:5173",
		"http://localhost:3000",
	];

	if (
		origin &&
		(allowedOrigins.includes(origin) || origin.includes("localhost"))
	) {
		headers.set("Access-Control-Allow-Origin", origin);
	}

	headers.set("Access-Control-Allow-Credentials", "true");
	headers.set(
		"Access-Control-Allow-Methods",
		"GET, PUT, OPTIONS, POST, DELETE, PATCH"
	);
	headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
	headers.set("Access-Control-Max-Age", "86400");

	return headers;
}

// Clean projection that only excludes password
const excludePassword = { projection: { password: 0 } };

/* =======================
   Route Handlers
======================= */

export async function OPTIONS(request: NextRequest) {
	const headers = getCorsHeaders(request.headers.get("origin"));
	headers.set("Cache-Control", "no-store, max-age=0");
	return new NextResponse(null, { status: 200, headers });
}

export async function GET(request: NextRequest) {
	const headers = getCorsHeaders(request.headers.get("origin"));

	try {
		const user = (await requireAuth(request)) as AuthUser;

		if (!user.userId) {
			return NextResponse.json(
				{ error: { message: "Invalid auth payload" } },
				{ status: 401, headers }
			);
		}

		const db = await getDatabase();
		const users = db.collection<UserDocument>("users");

		let foundUser: WithId<UserDocument> | null = null;

		console.log("🔍 Looking for user with:", {
			userId: user.userId,
			email: user.email,
			userIdLength: user.userId?.length,
			isObjectId: user.userId?.length === 24,
		});

		// Try multiple lookup methods
		const lookupMethods = [
			// 1. Try as MongoDB ObjectId
			async () => {
				if (user.userId && user.userId.length === 24) {
					try {
						return await users.findOne(
							{ _id: new ObjectId(user.userId) },
							excludePassword
						);
					} catch {
						return null;
					}
				}
				return null;
			},

			// 2. Try as firebaseUid
			async () => {
				if (user.userId) {
					return await users.findOne(
						{ firebaseUid: user.userId },
						excludePassword
					);
				}
				return null;
			},

			// 3. Try by email
			async () => {
				if (user.email) {
					return await users.findOne(
						{ email: user.email.toLowerCase().trim() },
						excludePassword
					);
				}
				return null;
			},
		];

		// Execute lookup methods in sequence
		for (const method of lookupMethods) {
			if (!foundUser) {
				foundUser = await method();
			}
		}

		if (!foundUser) {
			console.error("❌ User not found with any method:", {
				userId: user.userId,
				email: user.email,
			});
			return NextResponse.json(
				{
					error: {
						message: "User not found in database",
						debug: {
							searchedId: user.userId,
							searchedEmail: user.email,
						},
					},
				},
				{ status: 404, headers }
			);
		}

		console.log("✅ User found:", {
			id: foundUser._id.toString(),
			email: foundUser.email,
			focusSessions: foundUser.focusSessions,
			completedGoals: foundUser.completedGoals,
		});

		// Return user data with proper defaults
		return NextResponse.json(
			{
				id: foundUser._id.toString(),
				firebaseUid: foundUser.firebaseUid,
				email: foundUser.email,
				displayName: foundUser.displayName,
				photoURL: foundUser.photoURL,
				subscriptionTier: foundUser.subscriptionTier ?? "free",
				streak: foundUser.streak ?? 0,
				longestStreak: foundUser.longestStreak ?? 0,
				totalFocusMinutes: foundUser.totalFocusMinutes ?? 0,
				level: foundUser.level ?? 1,
				xp: foundUser.xp ?? 0,
				achievements: foundUser.achievements ?? [],
				// Critical: Include these fields with defaults
				completedGoals: foundUser.completedGoals ?? 0,
				focusSessions: foundUser.focusSessions ?? 0,
				stripeCustomerId: foundUser.stripeCustomerId,
				stripeSubscriptionId: foundUser.stripeSubscriptionId,
				subscriptionStatus: foundUser.subscriptionStatus,
				currentPeriodEnd: foundUser.currentPeriodEnd,
				updatedAt: foundUser.updatedAt,
				createdAt: foundUser.createdAt,
			},
			{ headers }
		);
	} catch (error: any) {
		console.error("❌ GET /user/me error:", error);
		return NextResponse.json(
			{ error: { message: "Server error", details: error.message } },
			{ status: 500, headers }
		);
	}
}

export async function PUT(request: NextRequest) {
	const headers = getCorsHeaders(request.headers.get("origin"));

	try {
		const user = (await requireAuth(request)) as AuthUser;
		const body: Partial<Pick<UserDocument, "displayName" | "photoURL">> =
			await request.json();

		const db = await getDatabase();
		const users = db.collection<UserDocument>("users");

		const updateData: Partial<UserDocument> = {
			updatedAt: new Date(),
			...(body.displayName && { displayName: body.displayName }),
			...(body.photoURL && { photoURL: body.photoURL }),
		};

		let result;

		// Try to update by multiple methods since we don't know what type of ID we have
		// 1. Try by MongoDB ObjectId (from custom JWT)
		if (user.userId && user.userId.length === 24) {
			try {
				result = await users.updateOne(
					{ _id: new ObjectId(user.userId) },
					{ $set: updateData }
				);
			} catch {
				// Invalid ObjectId, try next method
			}
		}

		// 2. Try by firebaseUid (if it exists)
		if ((!result || result.matchedCount === 0) && user.userId) {
			result = await users.updateOne(
				{ firebaseUid: user.userId },
				{ $set: updateData }
			);
		}

		// 3. Try by email (if we have it)
		if ((!result || result.matchedCount === 0) && user.email) {
			result = await users.updateOne(
				{ email: user.email.toLowerCase().trim() },
				{ $set: updateData }
			);
		}

		if (!result || !result.matchedCount) {
			return NextResponse.json(
				{
					error: {
						message: "User not found",
						debug: {
							userId: user.userId,
							email: user.email,
							hasFirebaseUid: !!user.userId,
							hasEmail: !!user.email,
						},
					},
				},
				{ status: 404, headers }
			);
		}

		// Find the updated user using the same logic
		let updatedUser: WithId<UserDocument> | null = null;

		if (user.userId && user.userId.length === 24) {
			try {
				updatedUser = await users.findOne(
					{ _id: new ObjectId(user.userId) },
					{ projection: { password: 0 } }
				);
			} catch {
				// ignore
			}
		}

		if (!updatedUser && user.userId) {
			updatedUser = await users.findOne(
				{ firebaseUid: user.userId },
				{ projection: { password: 0 } }
			);
		}

		if (!updatedUser && user.email) {
			updatedUser = await users.findOne(
				{ email: user.email.toLowerCase().trim() },
				{ projection: { password: 0 } }
			);
		}

		if (!updatedUser) {
			return NextResponse.json(
				{ error: { message: "User not found after update" } },
				{ status: 404, headers }
			);
		}

		return NextResponse.json(
			{
				id: updatedUser._id.toString(),
				firebaseUid: updatedUser.firebaseUid,
				email: updatedUser.email,
				displayName: updatedUser.displayName,
				photoURL: updatedUser.photoURL,
				subscriptionTier: updatedUser.subscriptionTier ?? "free",
				streak: updatedUser.streak ?? 0,
				longestStreak: updatedUser.longestStreak ?? 0,
				totalFocusMinutes: updatedUser.totalFocusMinutes ?? 0,
				level: updatedUser.level ?? 1,
				xp: updatedUser.xp ?? 0,
				achievements: updatedUser.achievements ?? [],
				// ADD THESE CRITICAL FIELDS:
				completedGoals: updatedUser.completedGoals ?? 0,
				focusSessions: updatedUser.focusSessions ?? 0,
				stripeCustomerId: updatedUser.stripeCustomerId,
				stripeSubscriptionId: updatedUser.stripeSubscriptionId,
				subscriptionStatus: updatedUser.subscriptionStatus,
				currentPeriodEnd: updatedUser.currentPeriodEnd,
			},
			{ headers }
		);
	} catch (error: any) {
		console.error("PUT /user/me error:", error);
		return NextResponse.json(
			{
				error: {
					message: "Server error",
					details: error.message,
				},
			},
			{ status: 500, headers }
		);
	}
}
