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
		let currentUser = await db
			.collection("users")
			.findOne(
				{ firebaseUid: user.userId },
				{ projection: { email: 1, displayName: 1, _id: 1, firebaseUid: 1 } }
			);

		if (!currentUser) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		// Look for invitation
		let invitation = await db.collection("collaboration_invitations").findOne({
			_id: invitationId as any,
			status: "pending",
		});

		if (!invitation) {
			invitation = await db.collection("pending_invitations").findOne({
				_id: invitationId as any,
				status: "pending",
			});
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

		// Check email match
		if (currentUser.email !== invitation.inviteeEmail) {
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

		// Update invitation status
		if (invitation.token) {
			// pending_invitations
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

		// IMPORTANT: Add quest to user's personal goals
		// Check if quest already exists in user_goals or similar collection
		const userQuestExists = await db.collection("user_goals").findOne({
			userId: currentUser.firebaseUid || currentUser._id.toString(),
			goalId: invitation.questId,
		});

		if (!userQuestExists) {
			// Add quest to user's personal goals
			await db.collection("user_goals").insertOne({
				userId: currentUser.firebaseUid || currentUser._id.toString(),
				goalId: invitation.questId,
				role: "collaborator",
				addedAt: timestamp,
				status: "active",
				isCollaborative: true,
				inviterId: invitation.inviterId,
				inviterName: invitation.inviterName,
				notificationRead: false,
			});
		}

		// ALTERNATIVE: If you don't have user_goals collection,
		// add a field to the goals collection to track user access
		await db.collection("goals").updateOne({ _id: invitation.questId } as any, {
			$addToSet: {
				accessibleTo: currentUser.firebaseUid || currentUser._id.toString(),
			},
		});

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

		// Get quest details for response
		const quest = await db
			.collection("goals")
			.findOne({ _id: invitation.questId } as any, {
				projection: {
					title: 1,
					category: 1,
					description: 1,
					dueDate: 1,
					userId: 1,
					collaborators: 1,
				},
			});

		const response = NextResponse.json({
			success: true,
			message: "🎉 Invitation accepted successfully!",
			quest: {
				id: invitation.questId,
				title: quest?.title || invitation.questTitle,
				category: quest?.category,
				description: quest?.description,
				dueDate: quest?.dueDate,
				isCollaborative: true,
				ownerId: quest?.userId || invitation.inviterId,
				collaborators: quest?.collaborators || [],
			},
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
				},
			},
			{ status: 500 }
		);
	}
}
