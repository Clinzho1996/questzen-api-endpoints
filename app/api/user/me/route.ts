import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

// Dynamic route handler that handles all methods
export async function GET(request: NextRequest) {
	return handleRequest(request, "GET");
}

export async function PUT(request: NextRequest) {
	return handleRequest(request, "PUT");
}

export async function OPTIONS(request: NextRequest) {
	return handleRequest(request, "OPTIONS");
}

async function handleRequest(request: NextRequest, method: string) {
	// Set CORS headers
	const origin = request.headers.get("origin") || "";
	const allowedOrigins = [
		"https://questzenai.devclinton.org",
		"http://localhost:5173",
		"http://localhost:3000",
	];

	const headers = new Headers();

	if (allowedOrigins.includes(origin) || origin.includes("localhost")) {
		headers.set("Access-Control-Allow-Origin", origin);
	}
	headers.set("Access-Control-Allow-Credentials", "true");
	headers.set(
		"Access-Control-Allow-Methods",
		"GET, PUT, OPTIONS, POST, DELETE, PATCH"
	);
	headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
	headers.set("Access-Control-Max-Age", "86400");

	// Handle OPTIONS preflight
	if (method === "OPTIONS" || request.method === "OPTIONS") {
		headers.set("Cache-Control", "no-store, max-age=0");
		return new NextResponse(null, { status: 200, headers });
	}

	try {
		if (method === "GET" || request.method === "GET") {
			const user = await requireAuth(request);
			const db = await getDatabase();

			const userData = await db
				.collection("users")
				.findOne({ firebaseUid: user.userId }, { projection: { password: 0 } });

			if (!userData) {
				return NextResponse.json(
					{ error: { message: "User not found" } },
					{ status: 404, headers }
				);
			}

			return NextResponse.json(
				{
					id: userData._id.toString(),
					firebaseUid: userData.firebaseUid,
					email: userData.email,
					displayName: userData.displayName,
					photoURL: userData.photoURL,
					subscriptionTier: userData.subscriptionTier || "free",
					streak: userData.streak || 0,
					longestStreak: userData.longestStreak || 0,
					totalFocusMinutes: userData.totalFocusMinutes || 0,
					level: userData.level || 1,
					xp: userData.xp || 0,
					achievements: userData.achievements || [],
					stripeCustomerId: userData.stripeCustomerId,
					stripeSubscriptionId: userData.stripeSubscriptionId,
					subscriptionStatus: userData.subscriptionStatus,
					currentPeriodEnd: userData.currentPeriodEnd,
				},
				{ headers }
			);
		}

		if (method === "PUT" || request.method === "PUT") {
			const user = await requireAuth(request);
			const body = await request.json();
			const { displayName, photoURL } = body;

			const db = await getDatabase();
			const updateData: any = { updatedAt: new Date() };

			if (displayName) updateData.displayName = displayName;
			if (photoURL) updateData.photoURL = photoURL;

			await db
				.collection("users")
				.updateOne({ firebaseUid: user.userId }, { $set: updateData });

			const updatedUser = await db
				.collection("users")
				.findOne({ firebaseUid: user.userId }, { projection: { password: 0 } });

			return NextResponse.json(
				{
					id: updatedUser!._id.toString(),
					firebaseUid: updatedUser!.firebaseUid,
					email: updatedUser!.email,
					displayName: updatedUser!.displayName,
					photoURL: updatedUser!.photoURL,
					subscriptionTier: updatedUser!.subscriptionTier || "free",
				},
				{ headers }
			);
		}

		// Method not allowed
		return NextResponse.json(
			{ error: { message: "Method not allowed" } },
			{ status: 405, headers }
		);
	} catch (error: any) {
		console.error(`API error (${method}):`, error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401, headers }
			);
		}

		return NextResponse.json(
			{ error: { message: "Server error" } },
			{ status: 500, headers }
		);
	}
}
