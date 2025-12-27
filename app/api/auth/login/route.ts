import { generateToken } from "@/lib/auth";
import { updateStreak, User } from "@/lib/models/User";
import { getDatabase } from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { email, password } = body;

		// Validation
		if (!email || !password) {
			return NextResponse.json(
				{ error: { message: "Missing required fields" } },
				{ status: 400 }
			);
		}

		const db = await getDatabase();

		// Find user
		const user = (await db.collection("users").findOne({
			email: email.toLowerCase(),
		})) as User | null;

		if (!user) {
			return NextResponse.json(
				{ error: { message: "Invalid credentials" } },
				{ status: 400 }
			);
		}

		// Verify password
		const isMatch = await bcrypt.compare(password, user.password);
		if (!isMatch) {
			return NextResponse.json(
				{ error: { message: "Invalid credentials" } },
				{ status: 400 }
			);
		}

		// Update streak
		const updatedUser = updateStreak(user);
		await db.collection("users").updateOne(
			{ _id: user._id },
			{
				$set: {
					streak: updatedUser.streak,
					longestStreak: updatedUser.longestStreak,
					lastActiveDate: updatedUser.lastActiveDate,
					updatedAt: new Date(),
				},
			}
		);

		// Generate token
		const token = generateToken(user._id!.toString());

		// Return user data including subscriptionTier
		return NextResponse.json({
			token,
			user: {
				id: user._id!.toString(),
				email: user.email,
				displayName: user.displayName,
				photoURL: user.photoURL,
				subscriptionTier: user.subscriptionTier || "free", // Make sure this is included
				streak: updatedUser.streak,
			},
		});
	} catch (error) {
		console.error("Login error:", error);
		return NextResponse.json(
			{ error: { message: "Server error" } },
			{ status: 500 }
		);
	}
}
