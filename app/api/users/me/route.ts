// app/api/user/route.ts
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		// 🔥 CRITICAL FIX: Look for user by firebaseUid, not MongoDB _id
		const userData = await db.collection("users").findOne(
			{
				firebaseUid: user.userId, // Use firebaseUid instead of _id
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
				{
					status: 404,
				}
			);
		}

		return NextResponse.json({
			id: userData._id.toString(),
			firebaseUid: userData.firebaseUid, // Include firebaseUid in response
			email: userData.email,
			displayName: userData.displayName,
			photoURL: userData.photoURL,
			subscriptionTier: userData.subscriptionTier || "free", // Default to 'free'
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
	} catch (error: any) {
		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{
					error: {
						message: "Unauthorized",
					},
				},
				{
					status: 401,
				}
			);
		}
		console.error("Get user error:", error);
		return NextResponse.json(
			{
				error: {
					message: "Server error",
				},
			},
			{
				status: 500,
			}
		);
	}
}

export async function PATCH(request: NextRequest) {
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

		// 🔥 CRITICAL FIX: Update by firebaseUid
		await db.collection("users").updateOne(
			{
				firebaseUid: user.userId, // Use firebaseUid instead of _id
			},
			{
				$set: updateData,
			}
		);

		const updatedUser = await db.collection("users").findOne(
			{
				firebaseUid: user.userId, // Use firebaseUid instead of _id
			},
			{
				projection: {
					password: 0,
				},
			}
		);

		return NextResponse.json({
			id: updatedUser!._id.toString(),
			firebaseUid: updatedUser!.firebaseUid,
			email: updatedUser!.email,
			displayName: updatedUser!.displayName,
			photoURL: updatedUser!.photoURL,
			subscriptionTier: updatedUser!.subscriptionTier || "free",
		});
	} catch (error: any) {
		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{
					error: {
						message: "Unauthorized",
					},
				},
				{
					status: 401,
				}
			);
		}
		console.error("Update user error:", error);
		return NextResponse.json(
			{
				error: {
					message: "Server error",
				},
			},
			{
				status: 500,
			}
		);
	}
}
