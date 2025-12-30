import crypto from "crypto";
import { getDatabase } from "./mongodb";

interface ResetToken {
	token: string;
	email: string;
	expiresAt: Date;
	createdAt: Date;
	used: boolean;
}

export async function generateResetToken(email: string): Promise<string> {
	const db = await getDatabase();

	// Generate random token
	const token = crypto.randomBytes(32).toString("hex");

	// Set expiry (1 hour from now)
	const expiresAt = new Date();
	expiresAt.setHours(expiresAt.getHours() + 1);

	// Store token in database
	await db.collection("password_reset_tokens").insertOne({
		token,
		email: email.toLowerCase(),
		expiresAt,
		createdAt: new Date(),
		used: false,
	});

	// Clean up old tokens for this email
	await db.collection("password_reset_tokens").deleteMany({
		email: email.toLowerCase(),
		expiresAt: { $lt: new Date() },
	});

	return token;
}

export async function validateResetToken(
	token: string,
	email: string
): Promise<boolean> {
	const db = await getDatabase();

	const resetToken = await db.collection("password_reset_tokens").findOne({
		token,
		email: email.toLowerCase(),
		used: false,
		expiresAt: { $gt: new Date() },
	});

	return !!resetToken;
}

export async function markTokenAsUsed(
	token: string,
	email: string
): Promise<void> {
	const db = await getDatabase();

	await db.collection("password_reset_tokens").updateOne(
		{
			token,
			email: email.toLowerCase(),
		},
		{
			$set: {
				used: true,
				usedAt: new Date(),
			},
		}
	);
}

export async function cleanupExpiredTokens(): Promise<void> {
	const db = await getDatabase();

	await db.collection("password_reset_tokens").deleteMany({
		expiresAt: { $lt: new Date() },
	});
}
