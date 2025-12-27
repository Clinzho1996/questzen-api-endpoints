import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const body = await request.json();
		const { invitationId } = body;

		if (!invitationId) {
			return NextResponse.json(
				{ error: { message: "Invitation ID is required" } },
				{ status: 400 }
			);
		}

		const db = await getDatabase();
		const timestamp = new Date();

		// Try different ID formats
		let invitation;

		// First try ObjectId
		try {
			const objectId = new ObjectId(invitationId);
			invitation = await db.collection("collaboration_invitations").findOne({
				_id: objectId,
				inviteeId: user.userId,
				status: "pending",
			});
		} catch {
			// If not ObjectId, try as string
			invitation = await db.collection("collaboration_invitations").findOne({
				_id: invitationId,
				inviteeId: user.userId,
				status: "pending",
			});
		}

		if (!invitation) {
			return NextResponse.json(
				{ error: { message: "Invitation not found or expired" } },
				{ status: 404 }
			);
		}

		// Update invitation status - handle both ID formats
		const updateFilter = ObjectId.isValid(invitationId)
			? { _id: new ObjectId(invitationId) }
			: { _id: invitationId };

		await db.collection("collaboration_invitations").updateOne(updateFilter, {
			$set: {
				status: "accepted",
				acceptedAt: timestamp,
				updatedAt: timestamp,
			},
		});

		// Handle questId format (could be ObjectId or string)
		let questIdFilter;
		try {
			questIdFilter = { _id: new ObjectId(invitation.questId) };
		} catch {
			questIdFilter = { _id: invitation.questId };
		}

		// Add user to quest collaborators
		await db.collection("goals").updateOne(questIdFilter, {
			$addToSet: {
				collaborators: {
					userId: user.userId,
					email: invitation.inviteeEmail,
					joinedAt: timestamp,
					role: "collaborator",
				},
			},
			// FIXED: Proper $pull syntax
			$pull: {
				pendingInvitations: {
					$elemMatch: { email: invitation.inviteeEmail },
				},
			} as any,
			$set: {
				updatedAt: timestamp,
				isCollaborative: true,
			},
		});

		// Create notification for inviter
		const inviterNotificationId = new ObjectId();
		await db.collection("notifications").insertOne({
			_id: inviterNotificationId,
			userId: invitation.inviterId,
			type: "collaboration_accepted",
			title: "🎉 Invitation Accepted!",
			message: `${invitation.inviteeEmail} accepted your invitation to "${invitation.questTitle}"`,
			data: {
				questId: invitation.questId,
				questTitle: invitation.questTitle,
				inviteeEmail: invitation.inviteeEmail,
				invitationId,
			},
			read: false,
			createdAt: timestamp,
		});

		// Clear the notification for invitee
		await db.collection("notifications").updateOne(
			{
				userId: user.userId,
				"data.invitationId": invitationId,
			},
			{
				$set: {
					read: true,
					updatedAt: timestamp,
				},
			}
		);

		const response = NextResponse.json({
			success: true,
			message: "🎉 Invitation accepted successfully!",
			questId: invitation.questId,
			questTitle: invitation.questTitle,
			collaborator: {
				userId: user.userId,
				email: invitation.inviteeEmail,
			},
		});

		// Add CORS headers
		const origin = request.headers.get("origin") || "";
		const allowedOrigins = [
			"https://questzenai.devclinton.org",
			"http://localhost:5173",
			"http://localhost:3000",
		];

		if (allowedOrigins.includes(origin)) {
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
