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
		console.log("🔍 Invitation ID type:", typeof invitationId);

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
				_id: i._id,
				_idType: typeof i._id,
				questId: i.questId,
				inviteeEmail: i.inviteeEmail,
				status: i.status,
			}))
		);

		console.log(
			"📁 pending_invitations sample:",
			allPendingInvites.map((i) => ({
				_id: i._id,
				_idType: typeof i._id,
				questId: i.questId,
				inviteeEmail: i.inviteeEmail,
				status: i.status,
			}))
		);

		// TRY DIFFERENT QUERY APPROACHES
		let invitation = null;

		// Try with explicit string comparison first
		console.log("🔄 Trying string comparison query...");
		const allInvitations = await db
			.collection("collaboration_invitations")
			.find({})
			.toArray();

		// Manually find by string comparison
		for (const inv of allInvitations) {
			if (inv._id?.toString() === invitationId) {
				invitation = inv;
				console.log("✅ Found by manual string comparison!");
				break;
			}
		}

		// If not found manually, try direct query with string
		if (!invitation) {
			console.log("🔄 Trying direct query with string...");
			// Try as string
			invitation = await db.collection("collaboration_invitations").findOne({
				_id: invitationId,
			} as any);
		}

		// If still not found, try pending_invitations
		if (!invitation) {
			console.log("🔄 Trying pending_invitations...");
			const allPending = await db
				.collection("pending_invitations")
				.find({})
				.toArray();

			for (const inv of allPending) {
				if (inv._id?.toString() === invitationId) {
					invitation = inv;
					console.log(
						"✅ Found in pending_invitations by manual string comparison!"
					);
					break;
				}
			}

			if (!invitation) {
				invitation = await db.collection("pending_invitations").findOne({
					_id: invitationId,
				} as any);
			}
		}

		console.log("🔎 Found invitation:", invitation);
		console.log("🔎 Invitation _id value:", invitation?._id);
		console.log("🔎 Invitation _id type:", typeof invitation?._id);

		if (!invitation) {
			return NextResponse.json(
				{
					error: {
						message: "Invitation not found. Please check the invitation link.",
					},
				},
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

		// Get quest details - handle questId format
		console.log("🔍 Getting quest with ID:", invitation.questId);
		console.log("🔍 Quest ID type:", typeof invitation.questId);

		let quest = null;

		// Try to find quest with the exact questId
		quest = await db
			.collection("goals")
			.findOne({ _id: invitation.questId } as any, {
				projection: {
					title: 1,
					category: 1,
					description: 1,
					dueDate: 1,
				},
			});

		// If not found, try to find by title or other field
		if (!quest && invitation.questTitle) {
			console.log("🔍 Quest not found by ID, trying by title...");
			quest = await db.collection("goals").findOne(
				{ title: invitation.questTitle },
				{
					projection: {
						title: 1,
						category: 1,
						description: 1,
						dueDate: 1,
					},
				}
			);
		}

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
			questTitle: quest?.title || invitation.questTitle || "Untitled Quest",
			questCategory: quest?.category || "General",
			questDescription: quest?.description || "",
			questDueDate: quest?.dueDate
				? new Date(quest.dueDate).toLocaleDateString()
				: null,
			inviterId: invitation.inviterId,
			inviterName:
				inviter?.displayName || invitation.inviterName || "QuestZen User",
			inviterEmail: invitation.inviterEmail,
			inviteeEmail: invitation.inviteeEmail,
			status: invitation.status || "pending",
			createdAt: invitation.createdAt,
			expiresAt: invitation.expiresAt,
			token: invitation.token, // For pending invitations
			isExistingUser: !!invitation.inviteeId, // True for collaboration_invitations
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
