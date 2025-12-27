import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { getDatabase } from "./mongodb";
if (!process.env.JWT_SECRET) {
	throw new Error("Please add JWT_SECRET to .env");
}
export interface AuthUser {
	userId: string;
	email: string;
	subscriptionTier: "free" | "premium";
	provider: string;
}
export async function verifyAuth(
	request: NextRequest
): Promise<AuthUser | null> {
	try {
		const authHeader = request.headers.get("authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return null;
		}
		const token = authHeader.substring(7);
		const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
			userId: string;
		};

		// Get user from database
		const db = await getDatabase();
		const user = await db.collection("users").findOne({
			_id: new ObjectId(decoded.userId),
		});
		if (!user) {
			return null;
		}
		return {
			userId: user._id.toString(),
			email: user.email,
			subscriptionTier: user.subscriptionTier || "free",
			provider: user.provider,
		};
	} catch (error) {
		console.error("Auth verification error:", error);
		return null;
	}
}
export function generateToken(userId: string): string {
	return jwt.sign(
		{
			userId,
		},
		process.env.JWT_SECRET!,
		{
			expiresIn: "30d",
		}
	);
}
export async function requireAuth(request: NextRequest): Promise<AuthUser> {
	const user = await verifyAuth(request);
	if (!user) {
		throw new Error("Unauthorized");
	}
	return user;
}
export async function requirePremium(request: NextRequest): Promise<AuthUser> {
	const user = await requireAuth(request);
	if (user.subscriptionTier !== "premium") {
		throw new Error("Premium subscription required");
	}
	return user;
}
