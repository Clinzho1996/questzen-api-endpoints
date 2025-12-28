import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		console.log("🔑 ACCEPT INVITATION REQUEST STARTED");
		console.log("📝 Request headers:", {
			authorization: request.headers.get("authorization"),
			contentType: request.headers.get("content-type"),
			origin: request.headers.get("origin"),
		});

		const user = await requireAuth(request);
		console.log("✅ requireAuth successful:", {
			userId: user.userId,
			email: user.email,
			provider: user.provider,
		});
		const body = await request.json();
		const { invitationId } = body;

		console.log("🎯 Accepting invitation:", invitationId);
		console.log("🔐 Auth user from requireAuth:", {
			userId: user.userId,
			email: user.email,
			provider: user.provider,
			firebaseUid: user.firebaseUid,
			isMongoDBId: /^[0-9a-fA-F]{24}$/.test(user.userId),
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
		// 1. FIND USER IN MONGODB (UPDATED FOR CUSTOM JWT)
		// ============================================
		let currentUser = null;

		console.log("🔍 Searching for user...");

		// Priority 1: Look by MongoDB _id if userId is MongoDB ID
		if (user.userId && /^[0-9a-fA-F]{24}$/.test(user.userId)) {
			try {
				currentUser = await db.collection("users").findOne({
					_id: new ObjectId(user.userId),
				});
				console.log("✅ Found user by MongoDB _id");
			} catch (error) {
				console.log("⚠️ Invalid ObjectId format");
			}
		}

		// Priority 2: Look by firebaseUid (for Firebase users)
		if (!currentUser && user.userId) {
			currentUser = await db.collection("users").findOne({
				firebaseUid: user.userId,
			});
			console.log("✅ Found user by firebaseUid");
		}

		// Priority 3: Look by email
		if (!currentUser && user.email) {
			currentUser = await db.collection("users").findOne({
				email: user.email.toLowerCase().trim(),
			});
			console.log("✅ Found user by email");
		}

		// Priority 4: Try all possible matches
		if (!currentUser && user.userId) {
			currentUser = await db.collection("users").findOne({
				$or: [
					{ firebaseUid: user.userId },
					{ _id: new ObjectId(user.userId) } as any,
					{ email: user.email },
				],
			});
			console.log("✅ Found user by combined query");
		}

		if (!currentUser) {
			console.log("🔄 User not found in MongoDB, creating new user...");

			// Determine user type
			const isMongoDBUser = /^[0-9a-fA-F]{24}$/.test(user.userId);
			const isFirebaseUser = user.provider === "firebase";

			const newUser = {
				firebaseUid: isFirebaseUser ? user.userId : undefined,
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

			console.log("✅ Created new user:", {
				_id: currentUser._id.toString(),
				email: currentUser.email,
			});
		} else {
			console.log("✅ Found existing user:", {
				_id: currentUser._id?.toString?.(),
				firebaseUid: currentUser.firebaseUid,
				email: currentUser.email,
				displayName: currentUser.displayName,
			});
		}

		// Get user IDs - USE MONGODB _id AS PRIMARY
		const userIdString = currentUser._id.toString(); // MongoDB _id string
		const userFirebaseUid = currentUser.firebaseUid; // Firebase UID if exists
		const userIdObjectId = currentUser._id;

		console.log("🎯 Using IDs:", {
			userIdString, // Primary ID: MongoDB _id string
			userFirebaseUid, // Secondary ID
			userIdObjectId: userIdObjectId?.toString(),
		});

		// ============================================
		// 2. FIND INVITATION
		// ============================================
		console.log("🔍 Looking for invitation...");

		let invitation = await db.collection("collaboration_invitations").findOne({
			_id: invitationId,
			status: "pending",
		});

		if (!invitation) {
			invitation = await db.collection("pending_invitations").findOne({
				_id: invitationId,
				status: "pending",
			});
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
			inviteeId: invitation.inviteeId,
			inviterEmail: invitation.inviterEmail,
			status: invitation.status,
		});

		// ============================================
		// 3. VALIDATE INVITATION
		// ============================================
		if (invitation.expiresAt && new Date(invitation.expiresAt) < timestamp) {
			return NextResponse.json(
				{ error: { message: "Invitation has expired" } },
				{ status: 410 }
			);
		}

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
			// From pending_invitations (new users)
			await db.collection("pending_invitations").updateOne(
				{ _id: invitation._id },
				{
					$set: {
						status: "accepted",
						acceptedAt: timestamp,
						updatedAt: timestamp,
						inviteeId: userIdString,
						inviteeFirebaseUid: userFirebaseUid,
					},
				}
			);
		} else {
			// From collaboration_invitations (existing users)
			await db.collection("collaboration_invitations").updateOne(
				{ _id: invitation._id },
				{
					$set: {
						status: "accepted",
						acceptedAt: timestamp,
						updatedAt: timestamp,
						inviteeId: userIdString,
						inviteeFirebaseUid: userFirebaseUid,
					},
				}
			);
		}

		console.log("✅ Updated invitation status");

		// ============================================
		// 5. ADD USER TO QUEST COLLABORATORS
		// ============================================
		let questIdFilter;
		try {
			questIdFilter = { _id: new ObjectId(invitation.questId) };
		} catch {
			questIdFilter = { _id: invitation.questId } as any;
		}

		const collaboratorData = {
			userId: userIdString, // MongoDB _id string
			userFirebaseUid: userFirebaseUid, // Firebase UID if exists
			email: currentUser.email,
			displayName: currentUser.displayName,
			joinedAt: timestamp,
			role: "collaborator",
		};

		// Get quest first to check owner
		const quest = await db.collection("goals").findOne(questIdFilter, {
			projection: { userId: 1, title: 1, isCollaborative: 1, collaborators: 1 },
		});

		if (!quest) {
			return NextResponse.json(
				{ error: { message: "Quest not found" } },
				{ status: 404 }
			);
		}

		// Update the goal - ADD user to collaborators
		await db.collection("goals").updateOne(questIdFilter, {
			$addToSet: {
				collaborators: collaboratorData,
				accessibleTo: userIdString,
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
		try {
			await db.collection("user_goals").insertOne({
				userId: userIdString,
				userFirebaseUid: userFirebaseUid,
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
		} catch (error) {
			console.log("ℹ️ user_goals error (might already exist):", error);
		}

		// ============================================
		// 7. CREATE NOTIFICATIONS
		// ============================================
		// Notification to inviter
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

		// Notification to invitee
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

		console.log("✅ Created notifications");

		// ============================================
		// 8. GET UPDATED QUEST DETAILS
		// ============================================
		const updatedQuest = await db.collection("goals").findOne(questIdFilter, {
			projection: {
				title: 1,
				category: 1,
				description: 1,
				dueDate: 1,
				userId: 1,
				collaborators: 1,
				createdAt: 1,
				updatedAt: 1,
				isCollaborative: 1,
			},
		});

		// Get inviter details
		let inviter = null;
		if (invitation.inviterId) {
			try {
				// Try as MongoDB _id
				if (/^[0-9a-fA-F]{24}$/.test(invitation.inviterId)) {
					inviter = await db.collection("users").findOne({
						_id: new ObjectId(invitation.inviterId),
					});
				}
				// Try as firebaseUid
				if (!inviter) {
					inviter = await db.collection("users").findOne({
						firebaseUid: invitation.inviterId,
					});
				}
			} catch (error) {
				console.log("⚠️ Error fetching inviter:", error);
			}
		}

		// ============================================
		// 9. PREPARE RESPONSE
		// ============================================
		const responseData = {
			success: true,
			message: "🎉 Invitation accepted successfully!",
			quest: {
				id: invitation.questId,
				title: updatedQuest?.title || invitation.questTitle,
				category: updatedQuest?.category || "General",
				description: updatedQuest?.description || "",
				dueDate: updatedQuest?.dueDate,
				isCollaborative: updatedQuest?.isCollaborative || true,
				ownerId: updatedQuest?.userId?.toString?.(),
				collaborators: updatedQuest?.collaborators || [collaboratorData],
				createdAt: updatedQuest?.createdAt,
				updatedAt: updatedQuest?.updatedAt,
			},
			collaborator: {
				userId: userIdString,
				userFirebaseUid: userFirebaseUid,
				email: currentUser.email,
				displayName: currentUser.displayName,
				role: "collaborator",
			},
			inviter: {
				id: invitation.inviterId,
				name: inviter?.displayName || invitation.inviterName,
				email: inviter?.email || invitation.inviterEmail,
				photoURL: inviter?.photoURL,
				role: "owner",
			},
			invitation: {
				id: invitation._id,
				status: "accepted",
				acceptedAt: timestamp,
			},
		};

		console.log("📤 Sending success response");

		return NextResponse.json(responseData);
	} catch (error: any) {
		console.error("❌ Accept invitation error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Please sign in to accept this invitation" } },
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{
				error: {
					message: "Failed to accept invitation",
					details: error.message,
				},
			},
			{ status: 500 }
		);
	}
}

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
