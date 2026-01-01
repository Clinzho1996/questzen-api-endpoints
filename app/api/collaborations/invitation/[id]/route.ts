// app/api/collaborations/invitation/[id]/route.ts
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

// Important: Export the config to mark as dynamic
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// For Next.js 15: Generate static params if needed
export async function generateStaticParams() {
	return [];
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
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
		console.log("📊 Checking database for invitation:", id);

		let invitation = null;
		let collectionName = "";
		let targetCollection = "";
		let targetId = "";
		let invitationType = "quest"; // default to quest

		// Check different collections in order
		const collectionsToCheck = [
			{ name: "collaboration_invitations", type: "quest" },
			{ name: "habit_collaboration_invitations", type: "habit" },
			{ name: "pending_invitations", type: "quest" },
			{ name: "pending_habit_invitations", type: "habit" },
		];

		for (const { name, type } of collectionsToCheck) {
			invitation = await db.collection(name).findOne({ _id: id } as any);
			if (invitation) {
				collectionName = name;
				invitationType = type;
				console.log(`✅ Found invitation in ${name} collection, type: ${type}`);
				break;
			}
		}

		if (!invitation) {
			console.error("❌ Invitation not found in any collection for ID:", id);
			return NextResponse.json(
				{
					error: {
						message: "Invitation not found or expired",
						details: `Invitation ID: ${id}`,
					},
				},
				{ status: 404 }
			);
		}

		console.log("✅ Found invitation:", {
			id: invitation._id,
			type: invitationType,
			collection: collectionName,
			targetId: invitation.questId || invitation.habitId,
			status: invitation.status,
			inviteeEmail: invitation.inviteeEmail,
		});

		// Determine target details based on type
		if (invitationType === "habit") {
			targetCollection = "habits";
			targetId = invitation.habitId;
		} else {
			targetCollection = "goals";
			targetId = invitation.questId;
		}

		console.log("🎯 Target details:", {
			targetCollection,
			targetId,
			targetTitle: invitation.questTitle || invitation.habitTitle,
		});

		// Get target details (quest or habit)
		let target = null;
		if (targetId) {
			try {
				target = await db
					.collection(targetCollection)
					.findOne({ _id: targetId } as any, {
						projection: {
							title: 1,
							name: 1,
							category: 1,
							description: 1,
							dueDate: 1,
							userId: 1,
						},
					});
				console.log(
					`📋 ${invitationType === "habit" ? "Habit" : "Quest"} found:`,
					target
				);
			} catch (error) {
				console.error(`Error fetching ${targetCollection}:`, error);
			}
		}

		// Get inviter details - handle both MongoDB _id and firebaseUid
		let inviter = null;
		if (invitation.inviterId) {
			try {
				// First try by MongoDB _id
				if (/^[0-9a-fA-F]{24}$/.test(invitation.inviterId)) {
					inviter = await db
						.collection("users")
						.findOne({ _id: invitation.inviterId } as any, {
							projection: {
								displayName: 1,
								photoURL: 1,
								email: 1,
								firebaseUid: 1,
							},
						});
					console.log("✅ Found inviter by MongoDB _id");
				}

				// If not found, try by firebaseUid
				if (!inviter) {
					inviter = await db.collection("users").findOne(
						{ firebaseUid: invitation.inviterId },
						{
							projection: {
								displayName: 1,
								photoURL: 1,
								email: 1,
								firebaseUid: 1,
							},
						}
					);
					console.log("✅ Found inviter by firebaseUid");
				}

				// If still not found, try by email
				if (!inviter && invitation.inviterEmail) {
					inviter = await db.collection("users").findOne(
						{ email: invitation.inviterEmail.toLowerCase().trim() },
						{
							projection: {
								displayName: 1,
								photoURL: 1,
								email: 1,
								firebaseUid: 1,
							},
						}
					);
					console.log("✅ Found inviter by email");
				}
			} catch (error) {
				console.error("Error fetching inviter:", error);
			}
		}

		console.log("👤 Inviter found:", inviter);

		// Prepare response data
		const targetTitle =
			target?.title ||
			target?.name ||
			invitation.questTitle ||
			invitation.habitTitle ||
			"Untitled";
		const targetDescription = target?.description || "";
		const targetCategory = target?.category || "General";
		const targetDueDate = target?.dueDate
			? new Date(target.dueDate).toLocaleDateString()
			: null;

		const responseData = {
			invitationId: invitation._id,
			invitationType: invitationType,
			targetId: targetId,
			targetTitle: targetTitle,
			targetCategory: targetCategory,
			targetDescription: targetDescription,
			targetDueDate: targetDueDate,
			inviterId: invitation.inviterId,
			inviterName:
				inviter?.displayName || invitation.inviterName || "QuestZen User",
			inviterEmail: inviter?.email || invitation.inviterEmail,
			inviteeEmail: invitation.inviteeEmail,
			status: invitation.status || "pending",
			createdAt: invitation.createdAt,
			expiresAt: invitation.expiresAt,
			isExistingUser: !!invitation.inviteeId,
			hasToken: !!invitation.token, // For new user invitations
		};

		console.log("📤 Returning response data:", {
			invitationId: responseData.invitationId,
			invitationType: responseData.invitationType,
			targetId: responseData.targetId,
			targetTitle: responseData.targetTitle,
			inviterName: responseData.inviterName,
			inviteeEmail: responseData.inviteeEmail,
			status: responseData.status,
		});

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
