import { validateResetToken } from "@/lib/passwordReset";
import { NextRequest, NextResponse } from "next/server";

// Verify reset token
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { token, email } = body;

		if (!token || !email) {
			return NextResponse.json(
				{ error: { message: "Token and email are required" } },
				{ status: 400 }
			);
		}

		// Validate token
		const isValid = await validateResetToken(token, email);

		if (!isValid) {
			return NextResponse.json(
				{ error: { message: "Invalid or expired reset token" } },
				{ status: 400 }
			);
		}

		return NextResponse.json(
			{ message: "Token is valid", valid: true },
			{ status: 200 }
		);
	} catch (error) {
		console.error("Token verification error:", error);
		return NextResponse.json(
			{ error: { message: "Server error" } },
			{ status: 500 }
		);
	}
}
