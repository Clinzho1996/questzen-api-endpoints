// app/api/collaborations/invitation/[id]/route.ts
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

// Important: Export the config to mark as dynamic
export const dynamic = "force-dynamic"; // Prevents static generation
export const fetchCache = "force-no-store";

export async function GET(
	request: NextRequest,
	{ params }: { params: { id: string } } // Correct: params is NOT a Promise
) {
	try {
		// Extract id directly from params (no await needed)
		const { id } = params;

		console.log("✅ Extracted invitation ID:", id);
		console.log("🔗 Full URL:", request.url);

		if (!id || id === "undefined") {
			console.error("❌ Invalid invitation ID:", id);
			return NextResponse.json(
				{ error: { message: "Invalid invitation link" } },
				{ status: 400 }
			);
		}

		const db = await getDatabase();

		// Simple direct query
		let invitation = await db.collection("collaboration_invitations").findOne({
			_id: id,
		} as any);

		if (!invitation) {
			invitation = await db.collection("pending_invitations").findOne({
				_id: id,
			} as any);
		}

		if (!invitation) {
			console.error("❌ Invitation not found in database for ID:", id);
			return NextResponse.json(
				{ error: { message: "Invitation not found or expired" } },
				{ status: 404 }
			);
		}

		console.log("✅ Found invitation:", {
			id: invitation._id,
			questId: invitation.questId,
			status: invitation.status,
			inviteeEmail: invitation.inviteeEmail,
		});

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
		console.error("❌ Get invitation error:", error);
		return NextResponse.json(
			{ error: { message: "Server error", details: error.message } },
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
	response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
	response.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization"
	);
	response.headers.set("Access-Control-Allow-Credentials", "true");
	response.headers.set("Access-Control-Max-Age", "86400");

	return response;
}
