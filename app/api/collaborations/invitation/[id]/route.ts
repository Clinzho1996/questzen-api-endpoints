// app/api/collaborations/invitation/[id]/route.ts
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const params = await context.params;
		const { id: invitationId } = params;

		console.log("🔍 Looking for invitation ID:", invitationId);

		if (!invitationId) {
			return NextResponse.json(
				{ error: { message: "Invitation ID is required" } },
				{ status: 400 }
			);
		}

		const db = await getDatabase();
		const now = new Date();

		// DEBUG: Log all invitations to see what's in DB
		console.log("📊 Checking database for invitations...");

		// Check both collections
		const allCollabInvites = await db
			.collection("collaboration_invitations")
			.find({})
			.limit(5)
			.toArray();
		const allPendingInvites = await db
			.collection("pending_invitations")
			.find({})
			.limit(5)
			.toArray();

		console.log(
			"📁 collaboration_invitations sample:",
			allCollabInvites.map((i) => ({
				_id: i._id?.toString?.(),
				questId: i.questId,
				inviteeEmail: i.inviteeEmail,
				status: i.status,
			}))
		);

		console.log(
			"📁 pending_invitations sample:",
			allPendingInvites.map((i) => ({
				_id: i._id?.toString?.(),
				questId: i.questId,
				inviteeEmail: i.inviteeEmail,
				status: i.status,
			}))
		);

		let invitation = null;

		// Since your invitation IDs are UUID strings, we need to look for them as strings
		// Try collaboration_invitations first
		invitation = await db.collection("collaboration_invitations").findOne({
			_id: invitationId as any,
		});

		// If not found, try pending_invitations
		if (!invitation) {
			console.log(
				"Not found in collaboration_invitations, trying pending_invitations..."
			);
			invitation = await db.collection("pending_invitations").findOne({
				_id: invitationId as any,
			});
		}

		console.log("🔎 Found invitation:", invitation);

		if (!invitation) {
			return NextResponse.json(
				{ error: { message: "Invitation not found" } },
				{ status: 404 }
			);
		}

		// Check if invitation is expired
		if (invitation.expiresAt && new Date(invitation.expiresAt) < now) {
			return NextResponse.json(
				{
					error: { message: "Invitation has expired" },
					invitation: { ...invitation, status: "expired" },
				},
				{ status: 410 }
			);
		}

		// Check if already accepted
		if (invitation.status === "accepted") {
			return NextResponse.json(
				{
					error: { message: "Invitation already accepted" },
					invitation,
				},
				{ status: 409 }
			);
		}

		// Check if rejected
		if (invitation.status === "rejected") {
			return NextResponse.json(
				{
					error: { message: "Invitation was declined" },
					invitation,
				},
				{ status: 410 }
			);
		}

		// Get quest details
		const quest = await db
			.collection("goals")
			.findOne({ _id: invitation.questId } as any, {
				projection: {
					title: 1,
					category: 1,
					description: 1,
					dueDate: 1,
				},
			});

		console.log("📋 Quest found:", quest);

		// Get inviter details
		const inviter = await db
			.collection("users")
			.findOne({ firebaseUid: invitation.inviterId } as any, {
				projection: { displayName: 1, photoURL: 1 },
			});

		const responseData = {
			invitationId,
			questId: invitation.questId,
			questTitle: quest?.title || invitation.questTitle,
			questCategory: quest?.category,
			questDescription: quest?.description,
			questDueDate: quest?.dueDate,
			inviterId: invitation.inviterId,
			inviterName: inviter?.displayName || invitation.inviterName,
			inviterEmail: invitation.inviterEmail,
			inviteeEmail: invitation.inviteeEmail,
			status: invitation.status || "pending",
			createdAt: invitation.createdAt,
			expiresAt: invitation.expiresAt,
		};

		console.log("✅ Returning invitation data:", responseData);

		const response = NextResponse.json(responseData);

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
		console.error("Get invitation error:", error);
		return NextResponse.json(
			{ error: { message: "Server error", details: error.message } },
			{ status: 500 }
		);
	}
}
