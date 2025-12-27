import { requireAuth } from "@/lib/auth";
import { sendCollaborationEmail } from "@/lib/email"; // We'll create this
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
	try {
		const inviter = await requireAuth(request);
		const body = await request.json();
		const {
			emails,
			questId,
			questTitle,
			inviterName,
			inviterEmail,
			questDescription = "",
		} = body;

		if (!emails || !Array.isArray(emails) || emails.length === 0) {
			return NextResponse.json(
				{ error: { message: "Emails are required" } },
				{ status: 400 }
			);
		}

		if (!questId || !questTitle) {
			return NextResponse.json(
				{ error: { message: "Quest information is required" } },
				{ status: 400 }
			);
		}

		const db = await getDatabase();
		const timestamp = new Date();
		const invitationId = uuidv4();

		// FIXED: Get inviter's details - try multiple ways
		let inviterData = null;

		// Try by firebaseUid first (for Firebase users)
		inviterData = await db
			.collection("users")
			.findOne(
				{ firebaseUid: inviter.userId },
				{ projection: { displayName: 1, email: 1, photoURL: 1, _id: 1 } }
			);

		// If not found by firebaseUid, try by _id (for MongoDB users)
		if (!inviterData) {
			try {
				// Try converting to ObjectId
				const objectId = new ObjectId(inviter.userId);
				inviterData = await db
					.collection("users")
					.findOne(
						{ _id: objectId },
						{ projection: { displayName: 1, email: 1, photoURL: 1, _id: 1 } }
					);
			} catch {
				// If not ObjectId, try as string
				inviterData = await db
					.collection("users")
					.findOne({ _id: inviter.userId } as any, {
						projection: { displayName: 1, email: 1, photoURL: 1, _id: 1 },
					});
			}
		}

		// If still not found, try by email (last resort)
		if (!inviterData && inviterEmail) {
			inviterData = await db
				.collection("users")
				.findOne(
					{ email: inviterEmail.toLowerCase().trim() },
					{ projection: { displayName: 1, email: 1, photoURL: 1, _id: 1 } }
				);
		}

		// Use provided data or fallback
		const inviterDisplayName =
			inviterName || inviterData?.displayName || "QuestZen User";
		const inviterDisplayEmail = inviterEmail || inviterData?.email || "";
		const inviterId = inviterData?._id?.toString() || inviter.userId;

		// Get quest details - handle both ObjectId and string
		let questIdFilter;
		try {
			questIdFilter = { _id: new ObjectId(questId) };
		} catch {
			questIdFilter = { _id: questId } as any;
		}

		const quest = await db.collection("goals").findOne(questIdFilter, {
			projection: { title: 1, category: 1, description: 1, dueDate: 1 },
		});

		const questDetails = {
			title: questTitle,
			category: quest?.category || "General",
			description: quest?.description || questDescription,
			dueDate: quest?.dueDate
				? new Date(quest.dueDate).toLocaleDateString()
				: "No due date",
		};

		const results = {
			sentEmails: [] as string[],
			existingUsers: [] as string[],
			newUsers: [] as string[],
			errors: [] as { email: string; error: string }[],
		};

		// Process each email invitation
		for (const email of emails) {
			try {
				// Check if user exists in the system
				const existingUser = await db
					.collection("users")
					.findOne(
						{ email: email.toLowerCase().trim() },
						{ projection: { _id: 1, firebaseUid: 1, displayName: 1 } }
					);

				if (existingUser) {
					// User exists - create notification
					const notificationId = uuidv4();

					// Create notification for existing user
					await db.collection("notifications").insertOne({
						_id: notificationId as any,
						userId: existingUser.firebaseUid || existingUser._id.toString(),
						type: "collaboration_invite",
						title: "🎯 Collaboration Invitation",
						message: `${inviterDisplayName} invited you to collaborate on "${questDetails.title}"`,
						data: {
							questId,
							questTitle: questDetails.title,
							inviterId: inviterId,
							inviterName: inviterDisplayName,
							inviterEmail: inviterDisplayEmail,
							invitationId,
							status: "pending",
						},
						read: false,
						createdAt: timestamp,
						expiresAt: new Date(timestamp.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
					});

					// Create invitation record
					await db.collection("collaboration_invitations").insertOne({
						_id: invitationId as any,
						questId,
						questTitle: questDetails.title,
						inviterId: inviterId,
						inviterName: inviterDisplayName,
						inviterEmail: inviterDisplayEmail,
						inviteeEmail: email,
						inviteeId: existingUser.firebaseUid || existingUser._id.toString(),
						status: "pending",
						createdAt: timestamp,
						expiresAt: new Date(timestamp.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
					});

					results.existingUsers.push(email);
				} else {
					// User doesn't exist - create pending invitation
					await db.collection("pending_invitations").insertOne({
						_id: invitationId as any,
						questId,
						questTitle: questDetails.title,
						inviterId: inviterId,
						inviterName: inviterDisplayName,
						inviterEmail: inviterDisplayEmail,
						inviteeEmail: email,
						status: "pending",
						createdAt: timestamp,
						token: uuidv4(), // For secure acceptance link
						expiresAt: new Date(timestamp.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
					});

					results.newUsers.push(email);
				}

				// Send email using your Nodemailer setup
				await sendCollaborationEmail(email, {
					inviterName: inviterDisplayName,
					inviterEmail: inviterDisplayEmail,
					questTitle: questDetails.title,
					questCategory: questDetails.category,
					questDescription: questDetails.description,
					questDueDate: questDetails.dueDate,
					invitationId,
					isExistingUser: !!existingUser,
				});

				results.sentEmails.push(email);
			} catch (error: any) {
				console.error(`Error processing invitation for ${email}:`, error);
				results.errors.push({
					email,
					error: error.message || "Failed to process invitation",
				});
			}
		}

		// Update quest with collaboration info
		await db.collection("goals").updateOne(questIdFilter, {
			$addToSet: {
				pendingInvitations: {
					$each: results.sentEmails.map((email) => ({
						email,
						invitationId,
						invitedAt: timestamp,
					})),
				},
			},
			$set: {
				isCollaborative: true,
				updatedAt: timestamp,
			},
		});

		const response = NextResponse.json({
			success: true,
			message: "Invitations processed successfully",
			summary: {
				totalInvited: emails.length,
				sentEmails: results.sentEmails.length,
				existingUsers: results.existingUsers.length,
				newUsers: results.newUsers.length,
				errors: results.errors.length,
			},
			details: {
				sentEmails: results.sentEmails,
				existingUsers: results.existingUsers,
				newUsers: results.newUsers,
				errors: results.errors,
			},
			invitationId,
			inviter: {
				id: inviterId,
				name: inviterDisplayName,
				email: inviterDisplayEmail,
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
		console.error("Invitation processing error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{
				error: {
					message: "Failed to process invitations",
					details: error.message,
				},
			},
			{ status: 500 }
		);
	}
}

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
	response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
	response.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization"
	);
	response.headers.set("Access-Control-Allow-Credentials", "true");
	response.headers.set("Access-Control-Max-Age", "86400");
	response.headers.set("Cache-Control", "no-store, max-age=0");

	return response;
}
