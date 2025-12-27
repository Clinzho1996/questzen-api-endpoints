// app/api/collaborations/accept/route.ts
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const body = await request.json();
		const { invitationId } = body;

		console.log("🎯 Accepting invitation:", invitationId);
		console.log("🔐 Authenticated user from requireAuth:", {
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

		// Get current user info - try multiple lookup methods
		let currentUser = null;

		// Method 1: Try firebaseUid (primary)
		if (user.userId) {
			console.log(`🔍 Looking up user by firebaseUid: ${user.userId}`);
			currentUser = await db
				.collection("users")
				.findOne(
					{ firebaseUid: user.userId },
					{ projection: { email: 1, displayName: 1, _id: 1 } }
				);
		}

		// Method 2: Try by email
		if (!currentUser && user.email) {
			console.log(`🔍 Looking up user by email: ${user.email}`);
			currentUser = await db
				.collection("users")
				.findOne(
					{ email: user.email.toLowerCase().trim() },
					{ projection: { email: 1, displayName: 1, _id: 1, firebaseUid: 1 } }
				);
		}

		// Method 3: Check if user exists at all in database
		if (!currentUser) {
			console.log("❌ User not found in database");
			console.log("📊 Checking users collection for debugging...");

			// List some users to see what's in the database
			const sampleUsers = await db
				.collection("users")
				.find({})
				.limit(5)
				.toArray();
			console.log(
				"📁 Sample users in database:",
				sampleUsers.map((u) => ({
					_id: u._id,
					firebaseUid: u.firebaseUid,
					email: u.email,
					displayName: u.displayName,
				}))
			);

			return NextResponse.json(
				{
					error: {
						message: "User account not found",
						details:
							"Your account exists in Firebase but not in our database. Please log out and log in again to sync your account.",
					},
				},
				{ status: 404 }
			);
		}

		console.log("👤 Found current user in database:", {
			_id: currentUser._id,
			firebaseUid: currentUser.firebaseUid,
			email: currentUser.email,
			displayName: currentUser.displayName,
		});

		// Look for invitation
		console.log("🔍 Looking for invitation with ID:", invitationId);
		let invitation = await db.collection("collaboration_invitations").findOne({
			_id: invitationId as any,
			status: "pending",
		});

		console.log("📋 Found in collaboration_invitations:", invitation);

		if (!invitation) {
			invitation = await db.collection("pending_invitations").findOne({
				_id: invitationId as any,
				status: "pending",
			});
			console.log("📋 Found in pending_invitations:", invitation);
		}

		if (!invitation) {
			return NextResponse.json(
				{ error: { message: "Invitation not found or already processed" } },
				{ status: 404 }
			);
		}

		console.log("✅ Invitation details:", {
			id: invitation._id,
			questId: invitation.questId,
			inviteeEmail: invitation.inviteeEmail,
			inviterEmail: invitation.inviterEmail,
			status: invitation.status,
		});

		// Check if current user's email matches invitation
		console.log("📧 Email check:", {
			currentUserEmail: currentUser.email,
			invitationEmail: invitation.inviteeEmail,
			match: currentUser.email === invitation.inviteeEmail,
		});

		if (currentUser.email !== invitation.inviteeEmail) {
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

		// Rest of your acceptance logic...
		// Update invitation status
		if (invitation.token) {
			// pending_invitations have token
			await db.collection("pending_invitations").updateOne(
				{ _id: invitationId as any },
				{
					$set: {
						status: "accepted",
						acceptedAt: timestamp,
						updatedAt: timestamp,
						inviteeId: currentUser.firebaseUid || currentUser._id.toString(),
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

		// Add user to quest collaborators
		await db.collection("goals").updateOne({ _id: invitation.questId } as any, {
			$addToSet: {
				collaborators: {
					userId: currentUser.firebaseUid || currentUser._id.toString(),
					email: currentUser.email,
					displayName: currentUser.displayName,
					joinedAt: timestamp,
					role: "collaborator",
				},
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

		// Create notifications
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
				collaboratorId: currentUser.firebaseUid || currentUser._id.toString(),
				collaboratorName: currentUser.displayName,
				collaboratorEmail: currentUser.email,
				invitationId,
			},
			read: false,
			createdAt: timestamp,
		});

		await db.collection("notifications").insertOne({
			userId: currentUser.firebaseUid || currentUser._id.toString(),
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

		const response = NextResponse.json({
			success: true,
			message: "🎉 Invitation accepted successfully!",
			questId: invitation.questId,
			questTitle: invitation.questTitle,
			collaborator: {
				userId: currentUser.firebaseUid || currentUser._id.toString(),
				email: currentUser.email,
				displayName: currentUser.displayName,
			},
			inviter: {
				id: invitation.inviterId,
				name: invitation.inviterName,
				email: invitation.inviterEmail,
			},
		});

		// CORS headers
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
