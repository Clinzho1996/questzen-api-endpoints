// app/api/collaborations/habits/invite/route.ts
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
			habitId,
			habitTitle,
			inviterName,
			inviterEmail,
			habitDescription = "",
		} = body;

		if (!emails || !Array.isArray(emails) || emails.length === 0) {
			return NextResponse.json(
				{ error: { message: "Emails are required" } },
				{ status: 400 }
			);
		}

		if (!habitId || !habitTitle) {
			return NextResponse.json(
				{ error: { message: "Habit information is required" } },
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

		// Get inviter's details
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

		// Strategy 2: Look by email
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
		const inviterId = inviterData?._id?.toString() || inviter.userId;
		const inviterMongoId = inviterData?._id;

		console.log("👤 FINAL Inviter details:", {
			inviterDisplayName,
			inviterDisplayEmail,
			inviterId,
			inviterMongoId: inviterMongoId?.toString(),
		});

		// Get habit details from habits collection
		let habitIdFilter;
		try {
			habitIdFilter = { _id: new ObjectId(habitId) };
		} catch {
			habitIdFilter = { _id: habitId } as any;
		}

		const habit = await db.collection("habits").findOne(habitIdFilter, {
			projection: {
				name: 1,
				category: 1,
				description: 1,
				userId: 1, // Owner ID
				collaborators: 1,
				isCollaborative: 1,
			},
		});

		if (!habit) {
			return NextResponse.json(
				{ error: { message: "Habit not found" } },
				{ status: 404 }
			);
		}

		// Verify the current user is the habit owner
		let isHabitOwner = false;
		const habitOwnerId = habit.userId;

		if (habitOwnerId instanceof ObjectId) {
			isHabitOwner = habitOwnerId.equals(inviterMongoId);
		} else if (typeof habitOwnerId === "string") {
			isHabitOwner =
				habitOwnerId === inviterId ||
				habitOwnerId === inviterMongoId?.toString();
		}

		if (!isHabitOwner) {
			console.log("❌ User is not habit owner:", {
				habitOwnerId: habitOwnerId?.toString?.(),
				inviterId,
				inviterMongoId: inviterMongoId?.toString(),
			});
			return NextResponse.json(
				{ error: { message: "Only habit owners can invite collaborators" } },
				{ status: 403 }
			);
		}

		const habitDetails = {
			title: habitTitle,
			name: habit.name,
			category: habit?.category || "General",
			description: habit?.description || habitDescription,
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
					});

					// Get invitee ID
					const inviteeId = existingUser._id.toString();

					// Create invitation record for existing user
					const invitationData = {
						_id: invitationId,
						type: "habit", // Add type field to distinguish from quest invitations
						habitId,
						habitTitle: habitDetails.title,
						inviterId: inviterId,
						inviterMongoId: inviterMongoId,
						inviterName: inviterDisplayName,
						inviterEmail: inviterDisplayEmail,
						inviteeEmail: cleanEmail,
						inviteeId: inviteeId,
						inviteeMongoId: existingUser._id,
						status: "pending",
						createdAt: timestamp,
						expiresAt: new Date(timestamp.getTime() + 7 * 24 * 60 * 60 * 1000),
					};

					await db
						.collection("habit_collaboration_invitations") // Separate collection for habits
						.insertOne(invitationData as any);

					// Create notification for existing user
					const notificationId = uuidv4();
					await db.collection("notifications").insertOne({
						_id: notificationId as any,
						userId: inviteeId,
						type: "habit_collaboration_invite",
						title: "🎯 Habit Collaboration Invitation",
						message: `${inviterDisplayName} invited you to collaborate on habit "${habitDetails.title}"`,
						data: {
							habitId,
							habitTitle: habitDetails.title,
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

					// Add to pending invitations on the habit
					await db.collection("habits").updateOne(habitIdFilter, {
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
					await db.collection("pending_habit_invitations").insertOne({
						_id: invitationId as any,
						type: "habit",
						habitId,
						habitTitle: habitDetails.title,
						inviterId: inviterId,
						inviterMongoId: inviterMongoId,
						inviterName: inviterDisplayName,
						inviterEmail: inviterDisplayEmail,
						inviteeEmail: cleanEmail,
						status: "pending",
						createdAt: timestamp,
						token: uuidv4(),
						expiresAt: new Date(timestamp.getTime() + 7 * 24 * 60 * 60 * 1000),
					});

					// Add to pending invitations on the habit
					await db.collection("habits").updateOne(habitIdFilter, {
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
						habitTitle: habitDetails.title,
						habitCategory: habitDetails.category,
						habitDescription: habitDetails.description,
						invitationId,
						isExistingUser: !!existingUser,
						type: "habit", // Specify it's a habit invitation
					});
					results.sentEmails.push(cleanEmail);
				} catch (emailError: any) {
					console.error(`Email failed for ${cleanEmail}:`, emailError);
				}
			} catch (error: any) {
				console.error(`Error processing invitation for ${email}:`, error);
				results.errors.push({
					email,
					error: error.message || "Failed to process invitation",
				});
			}
		}

		// Mark habit as collaborative
		await db.collection("habits").updateOne(habitIdFilter, {
			$set: {
				isCollaborative: true,
				updatedAt: timestamp,
			},
		});

		const response = NextResponse.json({
			success: true,
			message: "Habit invitations processed successfully",
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
			habit: {
				id: habitId,
				title: habitDetails.title,
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
		console.error("Habit invitation processing error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{
				error: {
					message: "Failed to process habit invitations",
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
