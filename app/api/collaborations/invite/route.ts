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

		// Get inviter's details
		const inviterData = await db
			.collection("users")
			.findOne(
				{ firebaseUid: inviter.userId },
				{ projection: { displayName: 1, email: 1, photoURL: 1 } }
			);

		const inviterDisplayName =
			inviterName || inviterData?.displayName || "QuestZen User";
		const inviterDisplayEmail = inviterEmail || inviterData?.email || "";

		// Get quest details
		const quest = await db
			.collection("goals")
			.findOne(
				{ _id: questId },
				{ projection: { title: 1, category: 1, description: 1, dueDate: 1 } }
			);

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
						_id: notificationId as unknown as ObjectId,
						userId: existingUser.firebaseUid || existingUser._id.toString(),
						type: "collaboration_invite",
						title: "🎯 Collaboration Invitation",
						message: `${inviterDisplayName} invited you to collaborate on "${questDetails.title}"`,
						data: {
							questId,
							questTitle: questDetails.title,
							inviterId: inviter.userId,
							inviterName: inviterDisplayName,
							inviterEmail: inviterDisplayEmail,
							invitationId,
							status: "pending",
						},
						read: false,
						createdAt: timestamp,
						expiresAt: new Date(timestamp.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
					});

					results.existingUsers.push(email);
				} else {
					// User doesn't exist - create pending invitation
					await db.collection("pending_invitations").insertOne({
						_id: invitationId as unknown as ObjectId,
						questId,
						questTitle: questDetails.title,
						inviterId: inviter.userId,
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
		await db.collection("goals").updateOne(
			{ _id: questId },
			{
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
			}
		);

		// If this is a collaborative quest, ensure it's marked as such
		if (results.sentEmails.length > 0) {
			await db
				.collection("goals")
				.updateOne({ _id: questId }, { $set: { isCollaborative: true } });
		}

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
