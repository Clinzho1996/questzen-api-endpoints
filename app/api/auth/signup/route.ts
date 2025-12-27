import { generateToken } from "@/lib/auth";
import { sendWelcomeEmail } from "@/lib/email";
import { User } from "@/lib/models/User";
import { getDatabase } from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { email, password, displayName } = body;

		// Validation
		if (!email || !password || !displayName) {
			return NextResponse.json(
				{ error: { message: "Missing required fields" } },
				{ status: 400 }
			);
		}

		if (password.length < 6) {
			return NextResponse.json(
				{ error: { message: "Password must be at least 6 characters" } },
				{ status: 400 }
			);
		}

		const db = await getDatabase();

		// Check if user exists
		const existingUser = await db.collection("users").findOne({
			email: email.toLowerCase(),
		});

		if (existingUser) {
			return NextResponse.json(
				{ error: { message: "User already exists" } },
				{ status: 400 }
			);
		}

		// Hash password
		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(password, salt);

		// Create user
		const newUser: Omit<User, "_id"> = {
			email: email.toLowerCase(),
			password: hashedPassword,
			displayName,
			photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
			subscriptionTier: "free", // Set default to free
			stripeCustomerId: undefined,
			stripeSubscriptionId: undefined,
			streak: 0,
			longestStreak: 0,
			lastActiveDate: undefined,
			totalFocusMinutes: 0,
			level: 1,
			xp: 0,
			achievements: [],
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const result = await db.collection("users").insertOne(newUser);

		// Send welcome email (non-blocking)
		sendWelcomeEmail(email, displayName).catch(console.error);

		// Generate token
		const token = generateToken(result.insertedId.toString());

		// Return user data including subscriptionTier
		return NextResponse.json(
			{
				token,
				user: {
					id: result.insertedId.toString(),
					email: newUser.email,
					displayName: newUser.displayName,
					photoURL: newUser.photoURL,
					subscriptionTier: newUser.subscriptionTier, // This will be 'free'
					streak: newUser.streak,
				},
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error("Signup error:", error);
		return NextResponse.json(
			{ error: { message: "Server error" } },
			{ status: 500 }
		);
	}
}
