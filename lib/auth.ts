export const runtime = "nodejs";

// lib/auth.ts - Simplified version
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { getDatabase } from "./mongodb";

export interface AuthUser {
	userId: string; // Can be firebaseUid OR MongoDB _id
	email: string;
	photoURL?: string;
	subscriptionTier: "free" | "premium";
	provider?: string; // Make optional
	firebaseUid?: string; // Make optional
}

// Helper to decode JWT
function decodeJWT(token: string): any {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return null;

		const payload = parts[1];
		const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
		const paddedBase64 = base64.padEnd(
			base64.length + ((4 - (base64.length % 4)) % 4),
			"="
		);

		if (typeof Buffer !== "undefined") {
			const decoded = Buffer.from(paddedBase64, "base64").toString("utf8");
			return JSON.parse(decoded);
		}
		return null;
	} catch (error) {
		console.error("Failed to decode JWT:", error);
		return null;
	}
}

export async function verifyAuth(
	request: NextRequest
): Promise<AuthUser | null> {
	try {
		const authHeader = request.headers.get("authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			console.log("❌ No Bearer token in header");
			return null;
		}

		const token = authHeader.substring(7);

		console.log("🔑 Token length:", token.length);
		console.log("🔑 Token starts with:", token.substring(0, 50));

		// Try to decode to see what type of token it is
		const decodedPayload = decodeJWT(token);

		if (decodedPayload) {
			console.log("🔍 Token claims:", {
				hasFirebase: !!decodedPayload.firebase,
				hasUserId: !!decodedPayload.userId,
				hasSub: !!decodedPayload.sub,
				email: decodedPayload.email,
				issuer: decodedPayload.iss,
			});
		}

		const db = await getDatabase();

		// FIRST: Try to verify as Firebase token (Google OAuth)
		if (
			decodedPayload &&
			(decodedPayload.firebase || decodedPayload.iss?.includes("google.com"))
		) {
			console.log("🔥 Detected Firebase/Google token");

			const firebaseUid =
				decodedPayload.uid || decodedPayload.sub || decodedPayload.user_id;
			const email = decodedPayload.email;

			if (!firebaseUid) {
				console.error("❌ No UID in Firebase token");
				return null;
			}

			console.log("👤 Firebase user:", { firebaseUid, email });

			// Find user by firebaseUid first
			let user = await db.collection("users").findOne({
				firebaseUid: firebaseUid,
			});

			// If not found, try by email
			if (!user && email) {
				user = await db.collection("users").findOne({
					email: email.toLowerCase().trim(),
				});

				// If found by email but no firebaseUid, update it
				if (user && !user.firebaseUid) {
					await db.collection("users").updateOne(
						{ _id: user._id },
						{
							$set: {
								firebaseUid: firebaseUid,
								updatedAt: new Date(),
							},
						}
					);
					user.firebaseUid = firebaseUid;
				}
			}

			// If still not found, create user
			if (!user) {
				console.log("🔄 Creating new Firebase user");

				const newUser = {
					firebaseUid: firebaseUid,
					email: email || "",
					displayName:
						decodedPayload.name || email?.split("@")[0] || "QuestZen User",
					photoURL: decodedPayload.picture || "",
					subscriptionTier: "free",
					createdAt: new Date(),
					updatedAt: new Date(),
				};

				const result = await db.collection("users").insertOne(newUser);
				user = {
					...newUser,
					_id: result.insertedId,
				};
			}

			// Return with firebaseUid as userId
			return {
				userId: user.firebaseUid, // Use firebaseUid
				email: user.email,
				subscriptionTier: user.subscriptionTier || "free",
				provider: "firebase",
				firebaseUid: user.firebaseUid,
			};
		}

		// SECOND: Try to verify as custom JWT (for email/password users)
		try {
			console.log("🔑 Trying to verify as custom JWT");
			const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
				userId: string;
			};

			const user = await db.collection("users").findOne({
				_id: new ObjectId(decoded.userId),
			});

			if (!user) {
				console.log("❌ User not found for custom JWT");
				return null;
			}

			console.log("✅ Custom JWT verified for:", user.email);

			return {
				userId: user._id.toString(), // Use MongoDB _id
				email: user.email,
				subscriptionTier: user.subscriptionTier || "free",
				provider: "custom-jwt",
				firebaseUid: user.firebaseUid,
			};
		} catch (jwtError: any) {
			console.log("❌ Custom JWT failed:", jwtError.message);

			// THIRD: If it's not a valid JWT, check if it's a legacy token format
			// Some tokens might be stored directly as MongoDB IDs
			if (token.length === 24 && /^[0-9a-fA-F]{24}$/.test(token)) {
				console.log("🔍 Token looks like MongoDB ID");
				try {
					const user = await db.collection("users").findOne({
						_id: new ObjectId(token),
					});

					if (user) {
						console.log("✅ Found user by MongoDB ID");
						return {
							userId: user._id.toString(),
							email: user.email,
							subscriptionTier: user.subscriptionTier || "free",
							provider: "legacy",
							firebaseUid: user.firebaseUid,
						};
					}
				} catch (error) {
					console.log("❌ Invalid MongoDB ID");
				}
			}

			// If we get here, token is invalid
			return null;
		}
	} catch (error) {
		console.error("❌ Auth verification error:", error);
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
		console.log("❌ requireAuth: No user found");
		throw new Error("Unauthorized");
	}

	console.log("✅ requireAuth success:", {
		userId: user.userId,
		email: user.email,
		provider: user.provider,
	});

	return user;
}

export async function requirePremium(request: NextRequest): Promise<AuthUser> {
	const user = await requireAuth(request);
	if (user.subscriptionTier !== "premium") {
		throw new Error("Premium subscription required");
	}
	return user;
}
