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

		if (!invitationId) {
			return NextResponse.json(
				{ error: { message: "Invitation ID is required" } },
				{ status: 400 }
			);
		}

		const db = await getDatabase();
		const timestamp = new Date();

		// Get current user info
		const currentUser = await db
			.collection("users")
			.findOne(
				{ firebaseUid: user.userId },
				{ projection: { email: 1, displayName: 1, _id: 1 } }
			);

		console.log("👤 Current user:", currentUser);

		if (!currentUser) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		// Look for invitation in both collections
		let invitation = null;

		// Try collaboration_invitations first (for existing users)
		invitation = await db.collection("collaboration_invitations").findOne({
			_id: invitationId as any,
			status: "pending",
		});

		console.log("📋 Found in collaboration_invitations:", invitation);

		// If not found, try pending_invitations (for new users)
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

		// Check if invitation has expired
		if (invitation.expiresAt && new Date(invitation.expiresAt) < timestamp) {
			return NextResponse.json(
				{ error: { message: "Invitation has expired" } },
				{ status: 410 }
			);
		}

		// For pending invitations (new users), verify email matches
		const isPendingInvitation = !!invitation.token; // pending_invitations have token field
		if (isPendingInvitation && currentUser.email !== invitation.inviteeEmail) {
			return NextResponse.json(
				{
					error: {
						message: "Email mismatch",
						details: `This invitation was sent to ${invitation.inviteeEmail}, but your account email is ${currentUser.email}`,
					},
				},
				{ status: 403 }
			);
		}

		// Update invitation status based on which collection it's in
		if (isPendingInvitation) {
			await db.collection("pending_invitations").updateOne(
				{ _id: invitationId as any },
				{
					$set: {
						status: "accepted",
						acceptedAt: timestamp,
						updatedAt: timestamp,
						inviteeId: currentUser.firebaseUid,
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
					userId: currentUser.firebaseUid,
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

		// Create notification for inviter
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
				collaboratorId: currentUser.firebaseUid,
				collaboratorName: currentUser.displayName,
				collaboratorEmail: currentUser.email,
				invitationId,
			},
			read: false,
			createdAt: timestamp,
		});

		// Create notification for invitee
		await db.collection("notifications").insertOne({
			userId: currentUser.firebaseUid,
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

		// Clear any existing notification for this invitation
		await db.collection("notifications").updateMany(
			{
				userId: currentUser.firebaseUid,
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

		const response = NextResponse.json({
			success: true,
			message: "🎉 Invitation accepted successfully!",
			questId: invitation.questId,
			questTitle: invitation.questTitle,
			collaborator: {
				userId: currentUser.firebaseUid,
				email: currentUser.email,
				displayName: currentUser.displayName,
			},
			inviter: {
				id: invitation.inviterId,
				name: invitation.inviterName,
				email: invitation.inviterEmail,
			},
		});

		// Add CORS headers
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
		console.error("Accept invitation error:", error);

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
