import { generateToken } from "@/lib/auth";
import { updateStreak, User } from "@/lib/models/User";
import { getDatabase } from "@/lib/mongodb";
import * as admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";

// Initialize Firebase Admin
function initializeFirebaseAdmin() {
	if (!admin.apps.length) {
		try {
			const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(
				/\\n/g,
				"\n"
			);

			if (!privateKey) {
				console.warn("FIREBASE_PRIVATE_KEY not found in environment variables");
				return null;
			}

			admin.initializeApp({
				credential: admin.credential.cert({
					projectId: process.env.FIREBASE_PROJECT_ID,
					clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
					privateKey: privateKey,
				}),
			});
			console.log("✅ Firebase Admin initialized");
		} catch (error) {
			console.error("Firebase Admin initialization error:", error);
			return null;
		}
	}
	return admin;
}

export async function POST(request: NextRequest) {
	const admin = initializeFirebaseAdmin();

	// If Firebase Admin not initialized, return error
	if (!admin) {
		return NextResponse.json(
			{ error: { message: "Firebase Admin not configured" } },
			{ status: 500 }
		);
	}

	try {
		const body = await request.json();
		const { token } = body; // Firebase ID token

		// Validation
		if (!token) {
			return NextResponse.json(
				{ error: { message: "Missing Firebase token" } },
				{ status: 400 }
			);
		}

		// Verify Firebase token
		let decodedToken;
		try {
			decodedToken = await admin.auth().verifyIdToken(token);
			console.log("✅ Firebase token verified for:", decodedToken.email);
		} catch (firebaseError) {
			console.error("Firebase token verification failed:", firebaseError);
			return NextResponse.json(
				{ error: { message: "Invalid Firebase token" } },
				{ status: 401 }
			);
		}

		const db = await getDatabase();
		const usersCollection = db.collection("users");

		// Check if user exists by Firebase UID
		let user = (await usersCollection.findOne({
			firebaseUid: decodedToken.uid,
		})) as User | null;

		// If not found by firebaseUid, check by email
		if (!user && decodedToken.email) {
			user = (await usersCollection.findOne({
				email: decodedToken.email.toLowerCase(),
			})) as User | null;

			// If found by email, link Firebase UID
			if (user) {
				console.log("🔗 Linking existing email user with Firebase UID");
				await usersCollection.updateOne(
					{ _id: user._id },
					{
						$set: {
							firebaseUid: decodedToken.uid,
							provider: "google", // or 'firebase'
							updatedAt: new Date(),
						},
					}
				);
				user.firebaseUid = decodedToken.uid;
				user.provider = "google";
			}
		}

		let isNewUser = false;

		// Create new user if doesn't exist
		if (!user) {
			console.log(
				"👤 Creating new user for Firebase user:",
				decodedToken.email
			);

			const displayName =
				decodedToken.name ||
				decodedToken.email?.split("@")[0] ||
				"QuestZen User";

			const now = new Date();
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			const newUser: User = {
				email: decodedToken.email?.toLowerCase() || "",
				displayName,
				photoURL: decodedToken.picture || null,
				firebaseUid: decodedToken.uid,
				provider: "google",
				subscriptionTier: "free",
				streak: 1,
				longestStreak: 1,
				lastActiveDate: today,
				totalFocusMinutes: 0,
				level: 1,
				xp: 0,
				achievements: [],
				completedGoals: 0,
				focusSessions: 0,
				subscriptionStatus: "inactive",
				createdAt: now,
				updatedAt: now,
			};

			const result = await usersCollection.insertOne(newUser);
			user = {
				...newUser,
				_id: result.insertedId,
			};
			isNewUser = true;
			console.log("✅ New user created with ID:", result.insertedId);
		} else {
			// Update existing user's streak
			const updatedUser = updateStreak(user);
			await usersCollection.updateOne(
				{ _id: user._id },
				{
					$set: {
						streak: updatedUser.streak,
						longestStreak: updatedUser.longestStreak,
						lastActiveDate: updatedUser.lastActiveDate,
						updatedAt: new Date(),
						// Update photo if Firebase has a newer one
						...(decodedToken.picture && !user.photoURL
							? { photoURL: decodedToken.picture }
							: {}),
					},
				}
			);
			user = { ...user, ...updatedUser };
			console.log("✅ Existing user updated, streak:", user.streak);
		}

		// Generate backend JWT token
		const backendToken = generateToken(user._id!.toString());
		console.log("🔐 JWT generated for user:", user.email);

		// Prepare response
		const userResponse = {
			id: user._id!.toString(),
			email: user.email,
			displayName: user.displayName,
			photoURL:
				user.photoURL ||
				`https://api.dicebear.com/7.x/avataaars/svg?seed=${user._id}`,
			firebaseUid: user.firebaseUid,
			provider: user.provider,
			subscriptionTier: user.subscriptionTier,
			streak: user.streak,
			longestStreak: user.longestStreak,
			xp: user.xp,
			level: user.level,
			completedGoals: user.completedGoals || 0,
			focusSessions: user.focusSessions || 0,
			totalFocusMinutes: user.totalFocusMinutes,
			achievements: user.achievements,
		};

		return NextResponse.json(
			{
				token: backendToken,
				user: userResponse,
				isNewUser,
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error("Firebase auth error:", error);
		return NextResponse.json(
			{
				error: {
					message: "Server error",
					details: error instanceof Error ? error.message : "Unknown error",
				},
			},
			{ status: 500 }
		);
	}
}
