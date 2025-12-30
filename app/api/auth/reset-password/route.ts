import { sendPasswordResetEmail } from "@/lib/email";
import { getDatabase } from "@/lib/mongodb";
import { generateResetToken } from "@/lib/passwordReset";
import { NextRequest, NextResponse } from "next/server";

// Request password reset
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { email } = body;

		if (!email) {
			return NextResponse.json(
				{ error: { message: "Email is required" } },
				{ status: 400 }
			);
		}

		const db = await getDatabase();

		// Check if user exists
		const user = await db.collection("users").findOne({
			email: email.toLowerCase(),
		});

		// For security, don't reveal if user exists or not
		if (!user) {
			// Return success even if user doesn't exist to prevent email enumeration
			return NextResponse.json(
				{
					message:
						"If an account exists with this email, you will receive a password reset link",
				},
				{ status: 200 }
			);
		}

		// Generate reset token
		const resetToken = await generateResetToken(email);

		// Send reset email
		await sendPasswordResetEmail(
			email,
			user.displayName || "QuestZen User",
			resetToken
		);

		return NextResponse.json(
			{
				message:
					"If an account exists with this email, you will receive a password reset link",
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error("Password reset request error:", error);
		return NextResponse.json(
			{ error: { message: "Server error" } },
			{ status: 500 }
		);
	}
}
