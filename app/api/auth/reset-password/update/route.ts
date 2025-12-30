import { sendPasswordResetConfirmationEmail } from "@/lib/email";
import { getDatabase } from "@/lib/mongodb";
import { markTokenAsUsed, validateResetToken } from "@/lib/passwordReset";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

// Update password with valid token
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { token, email, password } = body;

		if (!token || !email || !password) {
			return NextResponse.json(
				{ error: { message: "All fields are required" } },
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

		// Validate token
		const isValid = await validateResetToken(token, email);

		if (!isValid) {
			return NextResponse.json(
				{ error: { message: "Invalid or expired reset token" } },
				{ status: 400 }
			);
		}

		// Find user
		const user = await db.collection("users").findOne({
			email: email.toLowerCase(),
		});

		if (!user) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		// Hash new password
		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(password, salt);

		// Update password
		await db.collection("users").updateOne(
			{ _id: user._id },
			{
				$set: {
					password: hashedPassword,
					updatedAt: new Date(),
				},
			}
		);

		// Mark token as used
		await markTokenAsUsed(token, email);

		// Send confirmation email
		await sendPasswordResetConfirmationEmail(
			email,
			user.displayName || "QuestZen User"
		).catch(console.error);

		return NextResponse.json(
			{ message: "Password reset successful" },
			{ status: 200 }
		);
	} catch (error) {
		console.error("Password update error:", error);
		return NextResponse.json(
			{ error: { message: "Server error" } },
			{ status: 500 }
		);
	}
}
