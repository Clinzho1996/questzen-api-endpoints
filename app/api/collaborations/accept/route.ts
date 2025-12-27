// app/api/collaborations/accept/route.ts
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
			firebaseUid: user.userId,
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

		// Try multiple lookup methods
		const lookupMethods = [];

		// Method 1: Try firebaseUid (primary)
		if (user.userId) {
			lookupMethods.push(
				db
					.collection("users")
					.findOne(
						{ firebaseUid: user.userId },
						{ projection: { email: 1, displayName: 1, _id: 1, firebaseUid: 1 } }
					)
			);
		}

		// Method 2: Try by email
		if (user.email) {
			lookupMethods.push(
				db
					.collection("users")
					.findOne(
						{ email: user.email.toLowerCase().trim() },
						{ projection: { email: 1, displayName: 1, _id: 1, firebaseUid: 1 } }
					)
			);
		}

		// Method 3: Try by _id if it looks like ObjectId
		if (user.userId && user.userId.length === 24) {
			try {
				const objectId = new ObjectId(user.userId);
				lookupMethods.push(
					db.collection("users").findOne(
						{ _id: objectId },
						{
							projection: {
								email: 1,
								displayName: 1,
								_id: 1,
								firebaseUid: 1,
							},
						}
					)
				);
			} catch {
				// ignore invalid ObjectId
			}
		}

		// Wait for all lookups
		const results = await Promise.all(lookupMethods);
		currentUser = results.find((result) => result !== null) || null;

		// If user not found, create them
		if (!currentUser) {
			console.log("🔄 User not found in MongoDB, creating new user...");

			const newUser = {
				firebaseUid: user.userId,
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
				firebaseUid: user.userId,
				email: user.email || "",
				displayName: user.email?.split("@")[0] || "QuestZen User",
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

		// Get user IDs in all formats for database queries
		const userIdString = currentUser.firebaseUid || currentUser._id.toString();
		const userIdObjectId = currentUser._id;

		// ============================================
		// 2. FIND INVITATION
		// ============================================
		// In app/api/collaborations/accept/route.ts, update the invitation lookup:

		// ============================================
		// 2. FIND INVITATION
		// ============================================
		console.log("🔍 Looking for invitation...");

		// Try to find in both collections with different ID types
		let invitation = null;

		// First try: If it looks like ObjectId (24 hex chars)
		if (/^[0-9a-fA-F]{24}$/.test(invitationId)) {
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
				console.log("⚠️ Not a valid ObjectId, trying as string...");
			}
		}

		// Second try: If not found or not ObjectId, try as string (UUID)
		if (!invitation) {
			console.log("🔍 Trying to find invitation as string/UUID...");

			invitation = await db.collection("collaboration_invitations").findOne({
				_id: invitationId,
				status: "pending",
			});

			if (!invitation) {
				invitation = await db.collection("pending_invitations").findOne({
					_id: invitationId,
					status: "pending",
				});
			}

			// Third try: Look for invitation by invitationId field (if _id is different)
			if (!invitation) {
				invitation = await db.collection("collaboration_invitations").findOne({
					invitationId: invitationId,
					status: "pending",
				});

				if (!invitation) {
					invitation = await db.collection("pending_invitations").findOne({
						invitationId: invitationId,
						status: "pending",
					});
				}
			}
		}

		if (!invitation) {
			console.error("❌ Invitation not found:", invitationId);

			// Debug: List available invitations
			const allInvitations = await db
				.collection("collaboration_invitations")
				.find({ status: "pending" })
				.project({ _id: 1, inviteeEmail: 1, questTitle: 1 })
				.limit(10)
				.toArray();

			console.log("📋 Available pending invitations:", allInvitations);

			const pendingInvites = await db
				.collection("pending_invitations")
				.find({ status: "pending" })
				.project({ _id: 1, inviteeEmail: 1, questTitle: 1 })
				.limit(10)
				.toArray();

			console.log("📋 Available pending_invitations:", pendingInvites);

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
				{ _id: invitationId as any },
				{
					$set: {
						status: "accepted",
						acceptedAt: timestamp,
						updatedAt: timestamp,
						inviteeId: userIdString,
					},
				}
			);
		} else {
			await db.collection("collaboration_invitations").updateOne(
				{ _id: invitationId as any },
				{
					$set: {
						status: "accepted",
						acceptedAt: timestamp,
						updatedAt: timestamp,
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
			email: currentUser.email,
			displayName: currentUser.displayName,
			joinedAt: timestamp,
			role: "collaborator",
		};

		await db.collection("goals").updateOne(questIdFilter, {
			$addToSet: {
				collaborators: collaboratorData,
			},
			$pull: {
				pendingInvitations: {
					$or: [{ email: currentUser.email }, { invitationId: invitationId }],
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
				userId: userIdString,
				goalId: invitation.questId,
			});

			if (!userGoalExists) {
				await db.collection("user_goals").insertOne({
					userId: userIdString,
					goalId: invitation.questId,
					role: "collaborator",
					addedAt: timestamp,
					status: "active",
					isCollaborative: true,
					inviterId: invitation.inviterId,
					inviterName: invitation.inviterName,
					notificationRead: false,
				});
				console.log("✅ Added to user_goals collection");
			}
		} catch (error) {
			console.log("ℹ️ user_goals collection doesn't exist or error:", error);
			// Continue anyway - we'll handle this in the goals API
		}

		// Also add accessibleTo field for backup
		await db.collection("goals").updateOne(questIdFilter, {
			$addToSet: {
				accessibleTo: userIdString,
			},
		});

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
