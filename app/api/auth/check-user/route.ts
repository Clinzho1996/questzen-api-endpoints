// app/api/auth/check-user-status/route.ts
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { uid, email } = body;

		if (!uid && !email) {
			return NextResponse.json(
				{ error: "Missing UID or email" },
				{ status: 400 }
			);
		}

		const db = await getDatabase();
		const usersCollection = db.collection("users");

		// Find user by UID or email
		let query: any = {};
		if (uid) {
			// Check if uid is a valid ObjectId (for migrated users)
			if (uid.length === 24) {
				try {
					query = { $or: [{ firebaseUid: uid }, { _id: new ObjectId(uid) }] };
				} catch {
					query = { firebaseUid: uid };
				}
			} else {
				query = { firebaseUid: uid };
			}
		}
		if (email && !uid) {
			query = { email: email.toLowerCase().trim() };
		}

		const user = await usersCollection.findOne(query, {
			projection: {
				_id: 1,
				firebaseUid: 1,
				email: 1,
				displayName: 1,
				subscriptionTier: 1,
				deletedAt: 1,
				isDeleted: 1,
				// Add other essential fields that might be missing
				password: 1,
				createdAt: 1,
				updatedAt: 1,
			},
		});

		if (!user) {
			return NextResponse.json(
				{
					exists: false,
					message: "User not found",
				},
				{ status: 404 }
			);
		}

		// Check if user is deleted
		if (user.deletedAt || user.isDeleted) {
			// Clean up the deleted user document
			await usersCollection.deleteOne({ _id: user._id });

			return NextResponse.json(
				{
					exists: false,
					message: "Account was previously deleted and has been removed",
					wasDeleted: true,
				},
				{ status: 200 } // Return 200 so frontend can proceed with signup
			);
		}

		// Check for missing essential fields
		const missingFields = [];
		if (!user.email) missingFields.push("email");
		if (!user.displayName) missingFields.push("displayName");
		if (!user.createdAt) missingFields.push("createdAt");

		if (missingFields.length > 0) {
			console.warn(`User ${user._id} missing fields:`, missingFields);

			// Fix missing fields
			const updateData: any = {};
			if (!user.displayName) {
				updateData.displayName = user.email?.split("@")[0] || "User";
			}
			if (!user.createdAt) {
				updateData.createdAt = new Date();
			}
			if (!user.updatedAt) {
				updateData.updatedAt = new Date();
			}

			if (Object.keys(updateData).length > 0) {
				await usersCollection.updateOne(
					{ _id: user._id },
					{ $set: updateData }
				);
			}
		}

		return NextResponse.json({
			exists: true,
			user: {
				_id: user._id,
				firebaseUid: user.firebaseUid,
				email: user.email,
				displayName: user.displayName || user.email?.split("@")[0] || "User",
				subscriptionTier: user.subscriptionTier || "free",
				deletedAt: user.deletedAt || null,
				isDeleted: user.isDeleted || false,
			},
		});
	} catch (error: any) {
		console.error("Check user status error:", error);

		// More detailed error response
		return NextResponse.json(
			{
				error: "Failed to check user status",
				message: error.message,
				stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
			},
			{ status: 500 }
		);
	}
}

// Also add GET for testing/debugging
export async function GET(request: NextRequest) {
	try {
		const searchParams = request.nextUrl.searchParams;
		const email = searchParams.get("email");
		const uid = searchParams.get("uid");

		const db = await getDatabase();
		const usersCollection = db.collection("users");

		if (email) {
			const user = await usersCollection.findOne(
				{ email: email.toLowerCase() },
				{ projection: { password: 0 } }
			);

			if (!user) {
				return NextResponse.json(
					{ exists: false, message: "No user with this email" },
					{ status: 404 }
				);
			}

			return NextResponse.json({
				exists: true,
				user: {
					_id: user._id,
					email: user.email,
					displayName: user.displayName,
					subscriptionTier: user.subscriptionTier,
					createdAt: user.createdAt,
					deletedAt: user.deletedAt,
				},
			});
		}

		return NextResponse.json(
			{ error: "Provide email or uid parameter" },
			{ status: 400 }
		);
	} catch (error: any) {
		console.error("Debug check error:", error);
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}
