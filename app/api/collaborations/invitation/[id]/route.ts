// app/api/collaborations/invitation/[id]/route.ts
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

// Important: Export the config to mark as dynamic
export const dynamic = "force-dynamic"; // Prevents static generation
export const fetchCache = "force-no-store";

// For Next.js 15: Generate static params if needed
export async function generateStaticParams() {
	// Return empty array since we don't know invitation IDs at build time
	return [];
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> } // CHANGED: params is now a Promise in Next.js 15
) {
	try {
		// CHANGED: Await the params Promise
		const { id } = await params;

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

		// DEBUG: Log all invitations to see what's in DB
		console.log("📊 Checking database for invitations...");

		// First, let's see what's actually in the collection
		const allInvitations = await db
			.collection("collaboration_invitations")
			.find({})
			.toArray();
		console.log(
			"📁 All collaboration_invitations:",
			allInvitations.map((inv) => ({
				_id: inv._id,
				questId: inv.questId,
				status: inv.status,
				inviteeEmail: inv.inviteeEmail,
			}))
		);

		// Try to find the specific invitation
		let invitation = null;

		// Method 1: Direct query
		invitation = await db.collection("collaboration_invitations").findOne({
			_id: id,
		} as any);

		console.log("🔍 Direct query result:", invitation);

		// Method 2: If not found, try manual search (case-insensitive)
		if (!invitation) {
			console.log("🔄 Trying manual search...");
			for (const inv of allInvitations) {
				const invId = inv._id?.toString();
				if (invId && invId.toLowerCase() === id.toLowerCase()) {
					invitation = inv;
					console.log("✅ Found by case-insensitive match!");
					break;
				}
			}
		}

		// Method 3: Try pending_invitations
		if (!invitation) {
			console.log("🔄 Trying pending_invitations collection...");
			invitation = await db.collection("pending_invitations").findOne({
				_id: id,
			} as any);
		}

		if (!invitation) {
			console.error("❌ Invitation not found in database for ID:", id);
			console.error("❌ Tried ID:", id);
			console.error(
				"❌ Available IDs:",
				allInvitations.map((inv) => inv._id)
			);

			return NextResponse.json(
				{
					error: {
						message: "Invitation not found or expired",
						debug: {
							searchedId: id,
							availableIds: allInvitations.map((inv) => inv._id?.toString?.()),
						},
					},
				},
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
		console.log("🔍 Looking for quest with ID:", invitation.questId);
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

		console.log("👤 Inviter found:", inviter);

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

		console.log("📤 Returning response data:", responseData);

		const response = NextResponse.json(responseData);

		// CORS headers
		const origin = request.headers.get("origin") || "";
		const allowedOrigins = [
			"https://questzenai.devclinton.org",
			"https://questzen.app",
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
			{
				error: {
					message: "Server error",
					details: error.message,
					stack:
						process.env.NODE_ENV === "development" ? error.stack : undefined,
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
		"https://questzen.app",
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
