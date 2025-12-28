import { requireAuth } from "@/lib/auth";
import { sendCollaborationEmail } from "@/lib/email";
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

		console.log("🔍 Inviter auth info:", {
			userId: inviter.userId,
			email: inviter.email,
			provider: inviter.provider,
			isMongoDBId: /^[0-9a-fA-F]{24}$/.test(inviter.userId),
		});

		// Get inviter's details - UPDATED FOR CUSTOM JWT
		let inviterData = null;

		// Strategy 1: If userId is MongoDB ID, look by _id
		if (inviter.userId && /^[0-9a-fA-F]{24}$/.test(inviter.userId)) {
			try {
				inviterData = await db.collection("users").findOne(
					{ _id: new ObjectId(inviter.userId) },
					{
						projection: {
							displayName: 1,
							email: 1,
							photoURL: 1,
							_id: 1,
							firebaseUid: 1,
						},
					}
				);
				console.log("✅ Found inviter by MongoDB _id");
			} catch (error) {
				console.log("⚠️ Invalid ObjectId format for inviter");
			}
		}

		// Strategy 2: Look by firebaseUid (for Firebase users)
		if (!inviterData && inviter.userId) {
			inviterData = await db.collection("users").findOne(
				{ firebaseUid: inviter.userId },
				{
					projection: {
						displayName: 1,
						email: 1,
						photoURL: 1,
						_id: 1,
						firebaseUid: 1,
					},
				}
			);
			console.log("✅ Found inviter by firebaseUid");
		}

		// Strategy 3: Look by email
		if (!inviterData && inviter.email) {
			inviterData = await db.collection("users").findOne(
				{ email: inviter.email.toLowerCase().trim() },
				{
					projection: {
						displayName: 1,
						email: 1,
						photoURL: 1,
						_id: 1,
						firebaseUid: 1,
					},
				}
			);
			console.log("✅ Found inviter by email");
		}

		// If still not found, create user
		if (!inviterData) {
			console.log("🔄 Creating new inviter user...");
			const newUser = {
				firebaseUid: inviter.userId,
				email: inviter.email || "",
				displayName: inviter.email?.split("@")[0] || "QuestZen User",
				photoURL: "",
				subscriptionTier: "free",
				streak: 0,
				longestStreak: 0,
				totalFocusMinutes: 0,
				level: 1,
				xp: 0,
				achievements: [],
				createdAt: timestamp,
				updatedAt: timestamp,
			};

			const result = await db.collection("users").insertOne(newUser);
			inviterData = {
				_id: result.insertedId,
				firebaseUid: newUser.firebaseUid,
				email: newUser.email,
				displayName: newUser.displayName,
			};
			console.log("✅ Created new inviter user");
		}

		// Use provided data or fallback
		const inviterDisplayName =
			inviterName || inviterData?.displayName || "QuestZen User";
		const inviterDisplayEmail =
			inviterEmail || inviterData?.email || inviter.email || "";
		const inviterId = inviterData?._id?.toString() || inviter.userId; // Use MongoDB _id
		const inviterMongoId = inviterData?._id;
		const inviterFirebaseUid = inviterData?.firebaseUid;

		console.log("👤 FINAL Inviter details:", {
			inviterDisplayName,
			inviterDisplayEmail,
			inviterId, // MongoDB _id string
			inviterMongoId: inviterMongoId?.toString(),
			firebaseUid: inviterFirebaseUid,
		});

		// Get quest details
		let questIdFilter;
		try {
			questIdFilter = { _id: new ObjectId(questId) };
		} catch {
			questIdFilter = { _id: questId } as any;
		}

		const quest = await db.collection("goals").findOne(questIdFilter, {
			projection: {
				title: 1,
				category: 1,
				description: 1,
				dueDate: 1,
				userId: 1, // Owner ID
				collaborators: 1,
				isCollaborative: 1,
			},
		});

		if (!quest) {
			return NextResponse.json(
				{ error: { message: "Quest not found" } },
				{ status: 404 }
			);
		}

		// Verify the current user is the quest owner
		let isQuestOwner = false;
		const questOwnerId = quest.userId;

		if (questOwnerId instanceof ObjectId) {
			isQuestOwner = questOwnerId.equals(inviterMongoId);
		} else if (typeof questOwnerId === "string") {
			isQuestOwner =
				questOwnerId === inviterId ||
				questOwnerId === inviterMongoId?.toString() ||
				questOwnerId === inviterFirebaseUid;
		}

		if (!isQuestOwner) {
			console.log("❌ User is not quest owner:", {
				questOwnerId: questOwnerId?.toString?.(),
				inviterId,
				inviterMongoId: inviterMongoId?.toString(),
				inviterFirebaseUid,
			});
			return NextResponse.json(
				{ error: { message: "Only quest owners can invite collaborators" } },
				{ status: 403 }
			);
		}

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
			invitationIds: [] as string[],
		};

		// Process each email invitation
		for (const email of emails) {
			try {
				const cleanEmail = email.toLowerCase().trim();

				// Check if user exists in the system
				const existingUser = await db
					.collection("users")
					.findOne(
						{ email: cleanEmail },
						{ projection: { _id: 1, firebaseUid: 1, displayName: 1, email: 1 } }
					);

				// Generate UNIQUE invitation ID for each user
				const invitationId = uuidv4();

				if (existingUser) {
					console.log(`👤 Existing user found for ${cleanEmail}:`, {
						userId: existingUser._id.toString(),
						firebaseUid: existingUser.firebaseUid,
					});

					// Get invitee IDs
					const inviteeId = existingUser._id.toString(); // Use MongoDB _id
					const inviteeFirebaseUid = existingUser.firebaseUid;

					// Create invitation record for existing user
					const invitationData = {
						_id: invitationId,
						questId,
						questTitle: questDetails.title,
						inviterId: inviterId, // MongoDB _id string
						inviterMongoId: inviterMongoId,
						inviterName: inviterDisplayName,
						inviterEmail: inviterDisplayEmail,
						inviteeEmail: cleanEmail,
						inviteeId: inviteeId, // MongoDB _id string
						inviteeMongoId: existingUser._id,
						inviteeFirebaseUid: inviteeFirebaseUid,
						status: "pending",
						createdAt: timestamp,
						expiresAt: new Date(timestamp.getTime() + 7 * 24 * 60 * 60 * 1000),
					};

					await db
						.collection("collaboration_invitations")
						.insertOne(invitationData as any);

					// Create notification for existing user
					const notificationId = uuidv4();
					await db.collection("notifications").insertOne({
						_id: notificationId as any,
						userId: inviteeId, // Use MongoDB _id
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
						expiresAt: new Date(timestamp.getTime() + 30 * 24 * 60 * 60 * 1000),
					});

					// Add to pending invitations on the goal
					await db.collection("goals").updateOne(questIdFilter, {
						$addToSet: {
							pendingInvitations: {
								email: cleanEmail,
								invitationId,
								invitedAt: timestamp,
								inviterName: inviterDisplayName,
								status: "pending",
							},
						},
					});

					results.existingUsers.push(cleanEmail);
					results.invitationIds.push(invitationId);
				} else {
					console.log(`👤 New user invitation for ${cleanEmail}`);

					// Create pending invitation for new user
					await db.collection("pending_invitations").insertOne({
						_id: invitationId as any,
						questId,
						questTitle: questDetails.title,
						inviterId: inviterId,
						inviterMongoId: inviterMongoId,
						inviterName: inviterDisplayName,
						inviterEmail: inviterDisplayEmail,
						inviteeEmail: cleanEmail,
						status: "pending",
						createdAt: timestamp,
						token: uuidv4(), // For secure acceptance link
						expiresAt: new Date(timestamp.getTime() + 7 * 24 * 60 * 60 * 1000),
					});

					// Add to pending invitations on the goal
					await db.collection("goals").updateOne(questIdFilter, {
						$addToSet: {
							pendingInvitations: {
								email: cleanEmail,
								invitationId,
								invitedAt: timestamp,
								inviterName: inviterDisplayName,
								status: "pending",
							},
						},
					});

					results.newUsers.push(cleanEmail);
					results.invitationIds.push(invitationId);
				}

				// Send email
				try {
					await sendCollaborationEmail(cleanEmail, {
						inviterName: inviterDisplayName,
						inviterEmail: inviterDisplayEmail,
						questTitle: questDetails.title,
						questCategory: questDetails.category,
						questDescription: questDetails.description,
						questDueDate: questDetails.dueDate,
						invitationId,
						isExistingUser: !!existingUser,
					});
					results.sentEmails.push(cleanEmail);
				} catch (emailError: any) {
					console.error(`Email failed for ${cleanEmail}:`, emailError);
					// Don't fail the whole request if email fails
				}
			} catch (error: any) {
				console.error(`Error processing invitation for ${email}:`, error);
				results.errors.push({
					email,
					error: error.message || "Failed to process invitation",
				});
			}
		}

		// Mark quest as collaborative
		await db.collection("goals").updateOne(questIdFilter, {
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
				invitationIds: results.invitationIds,
			},
			inviter: {
				id: inviterId,
				mongoId: inviterMongoId?.toString(),
				name: inviterDisplayName,
				email: inviterDisplayEmail,
			},
			quest: {
				id: questId,
				title: questDetails.title,
				isCollaborative: true,
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
	const origin = request.headers.get("origin") || "";
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
