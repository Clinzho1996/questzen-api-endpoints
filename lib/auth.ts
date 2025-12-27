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
	firebaseUid?: string; // Make this optional
}

// Helper function to decode JWT without verification
function decodeJWT(token: string): any {
	try {
		// Split the token into parts
		const parts = token.split(".");
		if (parts.length !== 3) {
			return null;
		}

		// Decode the payload (middle part)
		const payload = parts[1];
		// Replace URL-safe base64 with regular base64
		const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
		// Add padding if needed
		const paddedBase64 = base64.padEnd(
			base64.length + ((4 - (base64.length % 4)) % 4),
			"="
		);

		// Decode using Buffer (Node.js) or atob (browser)
		let decoded;
		if (typeof Buffer !== "undefined") {
			// Node.js environment
			decoded = Buffer.from(paddedBase64, "base64").toString("utf8");
		} else {
			// Browser environment
			decoded = atob(paddedBase64);
		}

		return JSON.parse(decoded);
	} catch (error) {
		console.error("Failed to decode JWT:", error);
		return null;
	}
}

// lib/auth.ts - Update the Firebase token handling
export async function verifyAuth(
	request: NextRequest
): Promise<AuthUser | null> {
	try {
		const authHeader = request.headers.get("authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return null;
		}

		const token = authHeader.substring(7);

		console.log("🔑 Token received, length:", token.length);
		console.log("🔑 First 50 chars:", token.substring(0, 50));

		// Decode the token to see what's in it
		const decodedPayload = decodeJWT(token);

		if (decodedPayload) {
			console.log("🔑 Decoded payload keys:", Object.keys(decodedPayload));
			console.log("🔑 Important claims:", {
				uid: decodedPayload.uid,
				sub: decodedPayload.sub, // Firebase UID is often in 'sub'
				user_id: decodedPayload.user_id,
				firebase: decodedPayload.firebase,
				email: decodedPayload.email,
				email_verified: decodedPayload.email_verified,
			});
		}

		// Check if it's a Firebase token
		// Firebase tokens have either 'firebase' claim OR 'sub' with no 'userId'
		if (
			decodedPayload &&
			(decodedPayload.firebase ||
				(decodedPayload.sub && !decodedPayload.userId))
		) {
			// Get the actual Firebase UID
			const firebaseUid =
				decodedPayload.uid || decodedPayload.sub || decodedPayload.user_id;

			if (!firebaseUid) {
				console.error("❌ No UID found in Firebase token");
				return null;
			}

			console.log("🔑 Detected Firebase token with UID:", firebaseUid);

			// Get user from MongoDB by firebaseUid
			const db = await getDatabase();
			let user = await db.collection("users").findOne({
				firebaseUid: firebaseUid,
			});

			if (!user) {
				// Try by email (for Google OAuth users)
				if (decodedPayload.email) {
					const userByEmail = await db.collection("users").findOne({
						email: decodedPayload.email.toLowerCase().trim(),
					});

					if (userByEmail) {
						console.log("✅ Found user by email, updating firebaseUid");
						// Update with firebaseUid
						await db.collection("users").updateOne(
							{ _id: userByEmail._id },
							{
								$set: {
									firebaseUid: firebaseUid,
									updatedAt: new Date(),
								},
							}
						);
						userByEmail.firebaseUid = firebaseUid;
						user = userByEmail;
					}
				}

				// If still not found, create new user
				if (!user) {
					console.log("🔄 Creating new user from Firebase token...");

					const newUser = {
						firebaseUid: firebaseUid,
						email: decodedPayload.email || "",
						displayName:
							decodedPayload.name ||
							decodedPayload.email?.split("@")[0] ||
							"QuestZen User",
						photoURL: decodedPayload.picture || decodedPayload.avatar || "",
						subscriptionTier: "free",
						streak: 0,
						longestStreak: 0,
						totalFocusMinutes: 0,
						level: 1,
						xp: 0,
						achievements: [],
						authProviders: decodedPayload.firebase?.sign_in_provider
							? [decodedPayload.firebase.sign_in_provider.replace(".com", "")]
							: ["firebase"],
						createdAt: new Date(),
						updatedAt: new Date(),
					};

					const result = await db.collection("users").insertOne(newUser);

					user = {
						...newUser,
						_id: result.insertedId,
					};

					console.log("✅ Created new user with ID:", user._id);
				}
			} else {
				console.log("✅ Found existing user with matching firebaseUid");
			}

			return {
				userId: user._id.toString(),
				email: user.email,
				subscriptionTier: user.subscriptionTier || "free",
				provider: "firebase",
				firebaseUid: firebaseUid,
			};
		}

		// If not Firebase token, try custom JWT
		try {
			console.log("🔑 Trying to verify as custom JWT...");
			const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
				userId: string;
			};

			// Get user from database
			const db = await getDatabase();
			const user = await db.collection("users").findOne({
				_id: new ObjectId(decoded.userId),
			});

			if (!user) {
				console.log("❌ User not found for custom JWT");
				return null;
			}

			console.log("✅ Custom JWT verified, user found:", user.email);

			return {
				userId: user._id.toString(),
				email: user.email,
				subscriptionTier: user.subscriptionTier || "free",
				provider: "custom-jwt",
				firebaseUid: user.firebaseUid,
			};
		} catch (jwtError: any) {
			console.error("❌ Custom JWT verification error:", jwtError.message);
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
