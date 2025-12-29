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
}

interface AuthUser {
	userId: string;
	email?: string;
}

/* =======================
   CORS Helper
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

		// 🔥 FIX: Check if userId is a MongoDB ObjectId (from custom JWT)
		if (user.userId.length === 24) {
			try {
				foundUser = await users.findOne(
					{ _id: new ObjectId(user.userId) },
					{ projection: { password: 0 } }
				);
			} catch {
				// Invalid ObjectId, try next method
			}
		}

		// 2. Try firebaseUid
		if (!foundUser && user.userId) {
			foundUser = await users.findOne(
				{ firebaseUid: user.userId },
				{ projection: { password: 0 } }
			);
		}

		// 3. email fallback
		if (!foundUser && user.email) {
			foundUser = await users.findOne(
				{ email: user.email.toLowerCase().trim() },
				{ projection: { password: 0 } }
			);
		}

		if (!foundUser) {
			return NextResponse.json(
				{
					error: {
						message: "User not found in database",
						debug: {
							searchedId: user.userId,
							searchedEmail: user.email,
							idLength: user.userId.length,
							looksLikeObjectId: user.userId.length === 24,
						},
					},
				},
				{ status: 404, headers }
			);
		}

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
				stripeCustomerId: foundUser.stripeCustomerId,
				stripeSubscriptionId: foundUser.stripeSubscriptionId,
				subscriptionStatus: foundUser.subscriptionStatus,
				currentPeriodEnd: foundUser.currentPeriodEnd,
			},
			{ headers }
		);
	} catch (error) {
		console.error("GET /user/me error:", error);
		return NextResponse.json(
			{ error: { message: "Server error" } },
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
