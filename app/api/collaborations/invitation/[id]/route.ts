import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ id: string }> } // Changed: params is a Promise
) {
	try {
		// AWAIT the params first
		const params = await context.params; // ← Add this
		const { id: invitationId } = params;

		if (!invitationId) {
			return NextResponse.json(
				{ error: { message: "Invitation ID is required" } },
				{ status: 400 }
			);
		}

		const db = await getDatabase();
		const now = new Date();

		// Helper function to try finding with both ObjectId and string
		const findInvitation = async () => {
			let invitation = null;

			// First try as ObjectId
			if (ObjectId.isValid(invitationId)) {
				try {
					const objectId = new ObjectId(invitationId);
					invitation = await db
						.collection("collaboration_invitations")
						.findOne({ _id: objectId });

					if (!invitation) {
						invitation = await db
							.collection("pending_invitations")
							.findOne({ _id: objectId });
					}
				} catch (error) {
					console.log("ObjectId query failed, trying as string:", error);
				}
			}

			// If not found with ObjectId, try as string
			if (!invitation) {
				invitation = await db
					.collection("collaboration_invitations")
					.findOne({ _id: invitationId } as any);

				if (!invitation) {
					invitation = await db
						.collection("pending_invitations")
						.findOne({ _id: invitationId } as any);
				}
			}

			return invitation;
		};

		const invitation = await findInvitation();

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

		// Helper to get quest with proper ID handling
		const getQuest = async (questId: any) => {
			try {
				if (ObjectId.isValid(questId)) {
					return await db.collection("goals").findOne(
						{ _id: new ObjectId(questId) },
						{
							projection: {
								title: 1,
								category: 1,
								description: 1,
								dueDate: 1,
							},
						}
					);
				} else {
					return await db.collection("goals").findOne({ _id: questId } as any, {
						projection: { title: 1, category: 1, description: 1, dueDate: 1 },
					});
				}
			} catch (error) {
				console.error("Error fetching quest:", error);
				return null;
			}
		};

		// Get quest details
		const quest = await getQuest(invitation.questId);

		// Get inviter details
		const inviter = await db
			.collection("users")
			.findOne(
				{ firebaseUid: invitation.inviterId },
				{ projection: { displayName: 1, photoURL: 1 } }
			);

		const response = NextResponse.json({
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
		console.error("Get invitation error:", error);
		return NextResponse.json(
			{ error: { message: "Server error", details: error.message } },
			{ status: 500 }
		);
	}
}

// Also update OPTIONS handler
export async function OPTIONS(request: NextRequest) {
	const origin = request.headers.get("origin") || "http://localhost:5173";
	const allowedOrigins = [
		"https://questzenai.devclinton.org",
		"http://localhost:5173",
		"http://localhost:3000",
	];

	const response = new NextResponse(null, { status: 200 });

	if (allowedOrigins.includes(origin)) {
		response.headers.set("Access-Control-Allow-Origin", origin);
	}
	response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
	response.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization"
	);
	response.headers.set("Access-Control-Allow-Credentials", "true");
	response.headers.set("Access-Control-Max-Age", "86400");
	response.headers.set("Cache-Control", "no-store, max-age=0");

	return response;
}
