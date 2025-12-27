// For Next.js 15+ with async params
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

// Generate static params (optional)
export async function generateStaticParams() {
	return []; // Return empty array or actual IDs if you want static generation
}

// CORRECT for Next.js 15+: Await the params
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		// Await the params Promise
		const resolvedParams = await params;
		const { id: invitationId } = resolvedParams;

		console.log("✅ Correctly extracted invitation ID:", invitationId);

		if (!invitationId || invitationId === "undefined") {
			return NextResponse.json(
				{ error: { message: "Invitation ID is required" } },
				{ status: 400 }
			);
		}

		const db = await getDatabase();
		const now = new Date();

		console.log("🔍 Looking for invitation ID:", invitationId);

		// SIMPLE DIRECT QUERY - Since we know it's a string
		let invitation = await db.collection("collaboration_invitations").findOne({
			_id: invitationId,
		} as any);

		console.log("🔍 Query result:", invitation);

		if (!invitation) {
			console.log("❌ Not found in collaboration_invitations");
			invitation = await db.collection("pending_invitations").findOne({
				_id: invitationId,
			} as any);
			console.log("🔍 Pending invitations query result:", invitation);
		}

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

		console.log("✅ Found invitation:", {
			id: invitation._id,
			questId: invitation.questId,
			status: invitation.status,
		});

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

		// Get inviter details
		const inviter = await db
			.collection("users")
			.findOne({ firebaseUid: invitation.inviterId } as any, {
				projection: { displayName: 1, photoURL: 1 },
			});

		const responseData = {
			invitationId: invitation._id,
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
			isExistingUser: !!invitation.inviteeId,
		};

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

// OPTIONS handler
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
