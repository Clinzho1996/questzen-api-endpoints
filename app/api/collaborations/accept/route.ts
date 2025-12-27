import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const body = await request.json();
		const { invitationId } = body;

		console.log("🎯 Accepting invitation:", invitationId);
		console.log("🔐 Auth user from requireAuth:", {
			userId: user.userId,
			email: user.email,
			firebaseUid: user.firebaseUid,
			provider: user.provider,
		});

		if (!invitationId) {
			return NextResponse.json(
				{ error: { message: "Invitation ID is required" } },
				{ status: 400 }
			);
		}

		const db = await getDatabase();
		const timestamp = new Date();

		// ============================================
		// 1. FIND OR CREATE USER IN MONGODB
		// ============================================
		let currentUser = null;

		console.log("🔍 Looking for user with:", {
			userIdFromAuth: user.userId,
			emailFromAuth: user.email,
			provider: user.provider,
			firebaseUid: user.firebaseUid,
		});

		// Determine what type of ID we have
		const isFirebaseUid = user.userId && user.userId.length > 24; // Firebase UIDs are typically 28 chars
		const isMongoId = user.userId && /^[0-9a-fA-F]{24}$/.test(user.userId);

		console.log("📊 ID Analysis:", {
			isFirebaseUid,
			isMongoId,
			userIdLength: user.userId?.length,
		});

		if (user.provider === "firebase" || isFirebaseUid) {
			// This is a Firebase user - look by firebaseUid
			console.log("🔥 Looking for Firebase user with UID:", user.userId);
			currentUser = await db.collection("users").findOne({
				firebaseUid: user.userId,
			});

			if (!currentUser && user.firebaseUid) {
				// Try the firebaseUid field from AuthUser
				currentUser = await db.collection("users").findOne({
					firebaseUid: user.firebaseUid,
				});
			}
		} else if (isMongoId) {
			// This is a MongoDB _id
			console.log("🍃 Looking for MongoDB user with _id:", user.userId);
			try {
				currentUser = await db.collection("users").findOne({
					_id: new ObjectId(user.userId),
				});
			} catch (error) {
				console.error("❌ Error converting to ObjectId:", error);
			}
		}

		// If still not found, try by email
		if (!currentUser && user.email) {
			console.log("📧 Looking for user by email:", user.email);
			currentUser = await db.collection("users").findOne({
				email: user.email.toLowerCase().trim(),
			});

			// If found by email but doesn't have firebaseUid, update it
			if (currentUser && !currentUser.firebaseUid && user.firebaseUid) {
				console.log("🔄 Updating user with firebaseUid");
				await db.collection("users").updateOne(
					{ _id: currentUser._id },
					{
						$set: {
							firebaseUid: user.firebaseUid,
							updatedAt: timestamp,
						},
					}
				);
				currentUser.firebaseUid = user.firebaseUid;
			}
		}

		// If user not found, create them
		if (!currentUser) {
			console.log("🔄 User not found in MongoDB, creating new user...");

			const newUser = {
				firebaseUid: user.firebaseUid || user.userId,
				email: user.email || "",
				displayName: user.email?.split("@")[0] || "QuestZen User",
				photoURL: "",
				subscriptionTier: "free",
				streak: 0,
				longestStreak: 0,
				totalFocusMinutes: 0,
				level: 1,
				xp: 0,
				achievements: [],
				createdAt: timestamp,
				updatedAt: timestamp,
			};

			const result = await db.collection("users").insertOne(newUser);
			currentUser = {
				_id: result.insertedId,
				firebaseUid: newUser.firebaseUid,
				email: newUser.email,
				displayName: newUser.displayName,
			};

			console.log("✅ Created new user:", currentUser);
		} else {
			console.log("✅ Found existing user:", {
				_id: currentUser._id?.toString?.(),
				firebaseUid: currentUser.firebaseUid,
				email: currentUser.email,
				displayName: currentUser.displayName,
			});
		}

		// Get user IDs - prefer firebaseUid for userIdString
		const userIdString = currentUser.firebaseUid || currentUser._id.toString();
		const userIdObjectId = currentUser._id;

		console.log("🎯 Using IDs:", {
			userIdString,
			userIdObjectId: userIdObjectId?.toString(),
		});

		// ============================================
		// 2. FIND INVITATION
		// ============================================
		console.log("🔍 Looking for invitation...");

		let invitation = null;

		// First try: Look in collaboration_invitations by _id
		invitation = await db.collection("collaboration_invitations").findOne({
			_id: invitationId,
			status: "pending",
		});

		// Second try: Look in pending_invitations by _id
		if (!invitation) {
			invitation = await db.collection("pending_invitations").findOne({
				_id: invitationId,
				status: "pending",
			});
		}

		// Third try: Try as ObjectId if it looks like one
		if (!invitation && /^[0-9a-fA-F]{24}$/.test(invitationId)) {
			try {
				invitation = await db.collection("collaboration_invitations").findOne({
					_id: new ObjectId(invitationId),
					status: "pending",
				});

				if (!invitation) {
					invitation = await db.collection("pending_invitations").findOne({
						_id: new ObjectId(invitationId),
						status: "pending",
					});
				}
			} catch (error) {
				console.log("⚠️ Not a valid ObjectId");
			}
		}

		if (!invitation) {
			console.error("❌ Invitation not found:", invitationId);

			return NextResponse.json(
				{ error: { message: "Invitation not found or already processed" } },
				{ status: 404 }
			);
		}

		console.log("✅ Found invitation:", {
			id: invitation._id,
			questId: invitation.questId,
			inviteeEmail: invitation.inviteeEmail,
			inviterEmail: invitation.inviterEmail,
			status: invitation.status,
		});

		// ============================================
		// 3. VALIDATE INVITATION
		// ============================================
		// Check if invitation has expired
		if (invitation.expiresAt && new Date(invitation.expiresAt) < timestamp) {
			return NextResponse.json(
				{ error: { message: "Invitation has expired" } },
				{ status: 410 }
			);
		}

		// Check email match
		const currentUserEmail = currentUser.email?.toLowerCase().trim();
		const invitationEmail = invitation.inviteeEmail?.toLowerCase().trim();

		console.log("📧 Email check:", {
			currentUserEmail,
			invitationEmail,
			match: currentUserEmail === invitationEmail,
		});

		if (currentUserEmail !== invitationEmail) {
			return NextResponse.json(
				{
					error: {
						message: "Email mismatch",
						details: `This invitation was sent to ${invitation.inviteeEmail}, but your account email is ${currentUser.email}. Please log in with the correct account.`,
					},
				},
				{ status: 403 }
			);
		}

		// ============================================
		// 4. UPDATE INVITATION STATUS
		// ============================================
		if (invitation.token) {
			// pending_invitations
			await db.collection("pending_invitations").updateOne(
				{ _id: invitation._id },
				{
					$set: {
						status: "accepted",
						acceptedAt: timestamp,
						updatedAt: timestamp,
						inviteeId: userIdString,
						inviteeMongoId: currentUser._id.toString(),
					},
				}
			);
		} else {
			await db.collection("collaboration_invitations").updateOne(
				{ _id: invitation._id },
				{
					$set: {
						status: "accepted",
						acceptedAt: timestamp,
						updatedAt: timestamp,
						inviteeId: userIdString,
						inviteeMongoId: currentUser._id.toString(),
					},
				}
			);
		}

		console.log("✅ Updated invitation status");

		// ============================================
		// 5. ADD USER TO QUEST COLLABORATORS
		// ============================================
		// Convert questId to appropriate type
		let questIdFilter;
		try {
			questIdFilter = { _id: new ObjectId(invitation.questId) };
		} catch {
			questIdFilter = { _id: invitation.questId } as any;
		}

		// Update the goal to add collaborator
		const collaboratorData = {
			userId: userIdString,
			mongoUserId: currentUser._id.toString(),
			email: currentUser.email,
			displayName: currentUser.displayName,
			joinedAt: timestamp,
			role: "collaborator",
		};

		await db.collection("goals").updateOne(questIdFilter, {
			$addToSet: {
				collaborators: collaboratorData,
				accessibleTo: {
					$each: [
						userIdString, // firebaseUid
						currentUser._id.toString(), // MongoDB _id as string
						currentUser._id, // ObjectId
					].filter(Boolean),
				},
			},
			$pull: {
				pendingInvitations: {
					$or: [
						{ email: currentUser.email },
						{ invitationId: invitationId },
						{ _id: invitationId },
					],
				},
			} as any,
			$set: {
				updatedAt: timestamp,
				isCollaborative: true,
			},
		});

		console.log("✅ Added user to quest collaborators");

		// ============================================
		// 6. ADD QUEST TO USER'S PERSONAL GOALS
		// ============================================
		// Create user_goals entry if collection exists
		try {
			const userGoalExists = await db.collection("user_goals").findOne({
				$or: [
					{ userId: userIdString },
					{ mongoUserId: currentUser._id.toString() },
				],
				goalId: invitation.questId,
			});

			if (!userGoalExists) {
				await db.collection("user_goals").insertOne({
					userId: userIdString,
					mongoUserId: currentUser._id.toString(),
					goalId: invitation.questId,
					role: "collaborator",
					addedAt: timestamp,
					status: "active",
					isCollaborative: true,
					inviterId: invitation.inviterId,
					inviterName: invitation.inviterName,
					inviterEmail: invitation.inviterEmail,
					notificationRead: false,
				});
				console.log("✅ Added to user_goals collection");
			}
		} catch (error) {
			console.log("ℹ️ user_goals collection doesn't exist or error:", error);
		}

		// ============================================
		// 7. CREATE NOTIFICATIONS
		// ============================================
		// Notification for inviter
		await db.collection("notifications").insertOne({
			userId: invitation.inviterId,
			type: "collaboration_accepted",
			title: "🎉 Invitation Accepted!",
			message: `${
				currentUser.displayName || currentUser.email
			} accepted your invitation to collaborate on "${invitation.questTitle}"`,
			data: {
				questId: invitation.questId,
				questTitle: invitation.questTitle,
				collaboratorId: userIdString,
				collaboratorName: currentUser.displayName,
				collaboratorEmail: currentUser.email,
				invitationId,
			},
			read: false,
			createdAt: timestamp,
		});

		// Notification for invitee
		await db.collection("notifications").insertOne({
			userId: userIdString,
			type: "collaboration_joined",
			title: "🤝 Collaboration Started",
			message: `You're now collaborating with ${invitation.inviterName} on "${invitation.questTitle}"`,
			data: {
				questId: invitation.questId,
				questTitle: invitation.questTitle,
				inviterId: invitation.inviterId,
				inviterName: invitation.inviterName,
				inviterEmail: invitation.inviterEmail,
			},
			read: false,
			createdAt: timestamp,
		});

		// Mark any existing invitation notification as read
		await db.collection("notifications").updateMany(
			{
				userId: userIdString,
				"data.invitationId": invitationId,
			},
			{
				$set: {
					read: true,
					updatedAt: timestamp,
				},
			}
		);

		console.log("✅ Created notifications");

		// ============================================
		// 8. GET UPDATED QUEST DETAILS
		// ============================================
		const quest = await db.collection("goals").findOne(questIdFilter, {
			projection: {
				title: 1,
				category: 1,
				description: 1,
				dueDate: 1,
				userId: 1,
				collaborators: 1,
				createdAt: 1,
				updatedAt: 1,
			},
		});

		// Get inviter details for response
		const inviter = await db
			.collection("users")
			.findOne({ firebaseUid: invitation.inviterId } as any, {
				projection: { displayName: 1, photoURL: 1, email: 1 },
			});

		// ============================================
		// 9. PREPARE RESPONSE
		// ============================================
		const responseData = {
			success: true,
			message: "🎉 Invitation accepted successfully!",
			quest: {
				id: invitation.questId,
				title: quest?.title || invitation.questTitle,
				category: quest?.category || "General",
				description: quest?.description || "",
				dueDate: quest?.dueDate,
				isCollaborative: true,
				ownerId: quest?.userId || invitation.inviterId,
				collaborators: quest?.collaborators || [collaboratorData],
				createdAt: quest?.createdAt,
				updatedAt: quest?.updatedAt,
			},
			collaborator: {
				userId: userIdString,
				mongoUserId: currentUser._id.toString(),
				email: currentUser.email,
				displayName: currentUser.displayName,
			},
			inviter: {
				id: invitation.inviterId,
				name: inviter?.displayName || invitation.inviterName,
				email: inviter?.email || invitation.inviterEmail,
				photoURL: inviter?.photoURL,
			},
			invitation: {
				id: invitation._id,
				status: "accepted",
				acceptedAt: timestamp,
			},
		};

		console.log("📤 Sending response:", responseData);

		const response = NextResponse.json(responseData);

		// ============================================
		// 10. CORS HEADERS
		// ============================================
		const origin = request.headers.get("origin") || "";
		const allowedOrigins = [
			"https://questzenai.devclinton.org",
			"http://localhost:5173",
			"http://localhost:3000",
		];

		if (allowedOrigins.includes(origin) || origin.includes("localhost")) {
			response.headers.set("Access-Control-Allow-Origin", origin);
		}
		response.headers.set("Access-Control-Allow-Credentials", "true");

		return response;
	} catch (error: any) {
		console.error("❌ Accept invitation error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{
				error: {
					message: "Failed to accept invitation",
					details: error.message,
					stack:
						process.env.NODE_ENV === "development" ? error.stack : undefined,
				},
			},
			{ status: 500 }
		);
	}
}

// ============================================
// OPTIONS HANDLER
// ============================================
export async function OPTIONS(request: NextRequest) {
	const origin = request.headers.get("origin") || "";
	const allowedOrigins = [
		"https://questzenai.devclinton.org",
		"http://localhost:5173",
		"http://localhost:3000",
	];

	const response = new NextResponse(null, { status: 200 });

	if (allowedOrigins.includes(origin) || origin.includes("localhost")) {
		response.headers.set("Access-Control-Allow-Origin", origin);
	}
	response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
	response.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization"
	);
	response.headers.set("Access-Control-Allow-Credentials", "true");
	response.headers.set("Access-Control-Max-Age", "86400");

	return response;
}
