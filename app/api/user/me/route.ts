import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

// Handle OPTIONS request for CORS preflight
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
	response.headers.set(
		"Access-Control-Allow-Methods",
		"GET, PATCH, OPTIONS, DELETE, PUT"
	);
	response.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization"
	);
	response.headers.set("Access-Control-Allow-Credentials", "true");
	response.headers.set("Access-Control-Max-Age", "86400");

	// ⭐ ADD THIS LINE: Prevent caching of OPTIONS response
	response.headers.set("Cache-Control", "no-store, max-age=0");

	return response;
}

export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		// Look for user by firebaseUid
		const userData = await db.collection("users").findOne(
			{
				firebaseUid: user.userId,
			},
			{
				projection: {
					password: 0,
				},
			}
		);

		if (!userData) {
			return NextResponse.json(
				{
					error: {
						message: "User not found",
					},
				},
				{ status: 404 }
			);
		}

		const response = NextResponse.json({
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
		});

		// Add CORS headers
		const origin = request.headers.get("origin") || "";
		const allowedOrigins = [
			"https://questzenai.devclinton.org",
			"http://localhost:5173",
			"http://localhost:3000",
		];

		if (allowedOrigins.includes(origin)) {
			response.headers.set("Access-Control-Allow-Origin", origin);
		}
		response.headers.set("Access-Control-Allow-Credentials", "true");

		return response;
	} catch (error: any) {
		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}
		console.error("Get user error:", error);
		return NextResponse.json(
			{ error: { message: "Server error" } },
			{ status: 500 }
		);
	}
}

export async function PUT(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const body = await request.json();
		const { displayName, photoURL } = body;

		const db = await getDatabase();
		const updateData: any = {
			updatedAt: new Date(),
		};

		if (displayName) updateData.displayName = displayName;
		if (photoURL) updateData.photoURL = photoURL;

		// Update by firebaseUid
		await db.collection("users").updateOne(
			{
				firebaseUid: user.userId,
			},
			{
				$set: updateData,
			}
		);

		const updatedUser = await db.collection("users").findOne(
			{
				firebaseUid: user.userId,
			},
			{
				projection: {
					password: 0,
				},
			}
		);

		const response = NextResponse.json({
			id: updatedUser!._id.toString(),
			firebaseUid: updatedUser!.firebaseUid,
			email: updatedUser!.email,
			displayName: updatedUser!.displayName,
			photoURL: updatedUser!.photoURL,
			subscriptionTier: updatedUser!.subscriptionTier || "free",
		});

		// Add CORS headers
		const origin = request.headers.get("origin") || "";
		const allowedOrigins = [
			"https://questzenai.devclinton.org",
			"http://localhost:5173",
			"http://localhost:3000",
		];

		if (allowedOrigins.includes(origin)) {
			response.headers.set("Access-Control-Allow-Origin", origin);
		}
		response.headers.set("Access-Control-Allow-Credentials", "true");

		return response;
	} catch (error: any) {
		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}
		console.error("Update user error:", error);
		return NextResponse.json(
			{ error: { message: "Server error" } },
			{ status: 500 }
		);
	}
}
