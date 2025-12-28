// app/api/goals/route.ts - COMPLETE FIXED GET HANDLER
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

// GET all goals for the authenticated user
export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		console.log("🔐 Auth user from requireAuth:", {
			userId: user.userId,
			email: user.email,
			firebaseUid: user.firebaseUid,
		});

		// Get current user from MongoDB
		let currentUser = await db.collection("users").findOne(
			{
				$or: [
					{ firebaseUid: user.userId },
					{ _id: new ObjectId(user.userId) },
					{ email: user.email },
				],
			},
			{
				projection: {
					_id: 1,
					firebaseUid: 1,
					email: 1,
					displayName: 1,
					photoURL: 1,
				},
			}
		);

		if (!currentUser) {
			console.log("🔄 Creating new user...");
			const newUser = {
				firebaseUid: user.userId,
				email: user.email || "",
				displayName: user.email?.split("@")[0] || "QuestZen User",
				photoURL: "",
				subscriptionTier: "free",
				streak: 0,
				longestStreak: 0,
				totalFocusMinutes: 0,
				level: 1,
				xp: 0,
				achievements: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const result = await db.collection("users").insertOne(newUser);
			currentUser = {
				_id: result.insertedId,
				firebaseUid: user.userId,
				email: user.email || "",
				displayName: newUser.displayName,
				photoURL: "",
			};
		}

		// Get ALL possible identifiers for this user
		const userFirebaseUid = currentUser.firebaseUid || user.userId;
		const userMongoId = currentUser._id;
		const userMongoIdString = userMongoId.toString();
		const userEmail = currentUser.email;
		const userDisplayName =
			currentUser.displayName || userEmail?.split("@")[0] || "User";

		console.log("👤 Current user identifiers:", {
			firebaseUid: userFirebaseUid,
			mongoId: userMongoIdString,
			email: userEmail,
			displayName: userDisplayName,
		});

		// Build comprehensive query
		const queryConditions: any[] = [];

		// 1. User is owner (all possible ID formats)
		queryConditions.push({
			$or: [
				{ userId: userMongoId },
				{ userId: userFirebaseUid },
				{ userId: userMongoIdString },
				{ "ownerDetails.id": userMongoIdString },
				{ "ownerDetails.firebaseUid": userFirebaseUid },
				{ "ownerDetails.email": userEmail },
			],
		});

		// 2. User is collaborator
		queryConditions.push({
			$or: [
				{ "collaborators.userId": userFirebaseUid },
				{ "collaborators.userId": userMongoIdString },
				{ "collaborators.mongoUserId": userMongoIdString },
				{ "collaborators.email": userEmail },
			],
		});

		// 3. User is in accessibleTo
		queryConditions.push({
			accessibleTo: {
				$in: [userFirebaseUid, userMongoIdString, userMongoId],
			},
		});

		console.log("🔍 Executing query with conditions:", queryConditions.length);

		// Execute query
		const goals = await db
			.collection("goals")
			.find({
				$or: queryConditions,
			})
			.sort({ createdAt: -1 })
			.toArray();

		console.log(`✅ Found ${goals.length} total goals for user`);

		// Transform goals for frontend
		const transformedGoals = goals.map((goal) => {
			// Get user identifiers for comparison
			const goalUserId = goal.userId;
			const goalUserIdString = goalUserId?.toString();

			// CRITICAL FIX: Compare ALL possible user identifiers
			let isOwner = false;

			// Check all possible ways the current user could be the owner
			if (goalUserId) {
				// Case 1: userId is ObjectId - compare with userMongoId
				if (goalUserId instanceof ObjectId) {
					isOwner = goalUserId.equals(userMongoId);
				}
				// Case 2: userId is string - compare with all user identifiers
				else if (typeof goalUserId === "string") {
					isOwner =
						goalUserId === userFirebaseUid ||
						goalUserId === userMongoIdString ||
						goalUserId === userMongoId.toString() ||
						goalUserId === userEmail;
				}
			}

			// Also check if user is in ownerDetails
			if (!isOwner && goal.ownerDetails) {
				isOwner =
					goal.ownerDetails.id === userMongoIdString ||
					goal.ownerDetails.firebaseUid === userFirebaseUid ||
					goal.ownerDetails.email === userEmail;
			}

			// Check if user is collaborator
			let isCollaborator = false;
			if (goal.collaborators) {
				isCollaborator = goal.collaborators.some(
					(collab: any) =>
						collab.userId === userFirebaseUid ||
						collab.userId === userMongoIdString ||
						collab.mongoUserId === userMongoIdString ||
						collab.email === userEmail
				);
			}

			// CRITICAL FIX: Determine role - prioritize owner over collaborator
			const role = isOwner
				? "owner"
				: isCollaborator
				? "collaborator"
				: "viewer";

			// Determine if collaborative
			const isCollaborative =
				goal.isCollaborative ||
				isCollaborator ||
				(goal.collaborators && goal.collaborators.length > 0);

			// DEBUG LOGGING
			console.log(`Goal "${goal.title}":`, {
				goalUserId: goalUserIdString,
				userFirebaseUid,
				userMongoId: userMongoIdString,
				isOwner,
				isCollaborator,
				role,
				collaborators: goal.collaborators?.length || 0,
			});

			// Build participants array - INCLUDING CURRENT USER
			const participants: any = [];

			// Add owner
			if (goal.ownerDetails) {
				participants.push({
					id: goal.ownerDetails.id || goal.ownerDetails.firebaseUid,
					name: goal.ownerDetails.displayName || "Goal Owner",
					avatar:
						goal.ownerDetails.photoURL ||
						`https://ui-avatars.com/api/?name=${encodeURIComponent(
							goal.ownerDetails.displayName || "Owner"
						)}&background=random`,
					role: "owner",
				});
			} else {
				// Fallback if no ownerDetails
				participants.push({
					id: goalUserIdString || "unknown",
					name: "Goal Owner",
					avatar: `https://ui-avatars.com/api/?name=Owner&background=random`,
					role: "owner",
				});
			}

			// Add collaborators (including current user if they are a collaborator)
			if (goal.collaborators) {
				goal.collaborators.forEach((collab: any) => {
					const isCurrentUser =
						collab.userId === userFirebaseUid ||
						collab.userId === userMongoIdString ||
						collab.email === userEmail;

					// Only add if not already in participants (could happen if collaborator is also owner)
					const alreadyInParticipants = participants.some(
						(p: any) => p.id === (collab.userId || collab.mongoUserId)
					);

					if (!alreadyInParticipants) {
						participants.push({
							id: collab.userId || collab.mongoUserId || collab.email,
							name:
								collab.displayName ||
								collab.email?.split("@")[0] ||
								"Collaborator",
							avatar:
								collab.photoURL ||
								`https://ui-avatars.com/api/?name=${encodeURIComponent(
									collab.displayName || collab.email?.charAt(0) || "C"
								)}&background=random`,
							role: collab.role || "collaborator",
							isCurrentUser: isCurrentUser,
						});
					}
				});
			}

			// Format dates
			const dueDate =
				goal.dueDate ||
				(goal.deadline
					? new Date(goal.deadline).toISOString().split("T")[0]
					: undefined);

			const dueTime =
				goal.dueTime ||
				(goal.deadline
					? new Date(goal.deadline).toISOString().split("T")[1].substring(0, 5)
					: undefined);

			// Calculate progress
			let progress = 0;
			if (typeof goal.progress === "number") {
				progress = goal.progress;
			} else if (goal.completed) {
				progress = 100;
			} else if (goal.tasks && Array.isArray(goal.tasks)) {
				const completedTasks = goal.tasks.filter((task: any) => task.completed);
				progress =
					goal.tasks.length > 0
						? Math.round((completedTasks.length / goal.tasks.length) * 100)
						: 0;
			}

			// Return transformed goal
			return {
				id: goal._id.toString(),
				title: goal.title,
				description: goal.description || "",
				category: goal.category || "Others",
				priority: goal.priority || "medium",
				dueDate,
				dueTime,
				deadline: goal.deadline?.toISOString?.(),
				progress,
				completed: goal.completed || false,
				tasks: goal.tasks || [],
				aiSuggestions: goal.aiSuggestions || [],
				role, // FIXED: Now returns "owner" for user's own goals
				isCollaborative,
				participants,
				collaborators: goal.collaborators || [],
				isOwner, // FIXED: Now true for user's own goals
				ownerId: goal.userId?.toString?.(),
				createdAt: goal.createdAt?.toISOString?.() || new Date().toISOString(),
				updatedAt: goal.updatedAt?.toISOString?.() || new Date().toISOString(),
				shared: isCollaborative,
				sharedWith: participants.length,
				// Add any additional fields
				...(goal.recurring ? { recurring: goal.recurring } : {}),
				...(goal.tags ? { tags: goal.tags } : {}),
				...(goal.color ? { color: goal.color } : {}),
				...(goal.icon ? { icon: goal.icon } : {}),
			};
		});

		console.log("📤 Returning", transformedGoals.length, "goals");

		return NextResponse.json(transformedGoals);
	} catch (error: any) {
		console.error("❌ Get goals error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{
				error: {
					message: "Failed to fetch goals",
					details: error.message,
				},
			},
			{ status: 500 }
		);
	}
}

// POST create a new goal
export async function POST(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const body = await request.json();
		const {
			title,
			description,
			category,
			priority,
			dueDate,
			dueTime,
			deadline,
			userId,
			isCollaborative,
			collaborators = [],
		} = body;

		console.log("🎯 Creating goal with data:", {
			title,
			category,
			priority,
			dueDate,
			dueTime,
			deadline,
			isCollaborative,
			collaboratorsCount: collaborators.length,
		});

		// Validation
		if (!title || !category) {
			return NextResponse.json(
				{ error: { message: "Title and category are required" } },
				{ status: 400 }
			);
		}

		const db = await getDatabase();

		// Get current user
		let currentUser = await db
			.collection("users")
			.findOne(
				{ firebaseUid: user.userId },
				{ projection: { _id: 1, firebaseUid: 1, email: 1, displayName: 1 } }
			);

		if (!currentUser) {
			console.log("🔄 Creating new user for goal creation...");
			const newUser = {
				firebaseUid: user.userId,
				email: user.email || "",
				displayName: user.email?.split("@")[0] || "QuestZen User",
				photoURL: "",
				subscriptionTier: "free",
				streak: 0,
				longestStreak: 0,
				totalFocusMinutes: 0,
				level: 1,
				xp: 0,
				achievements: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const result = await db.collection("users").insertOne(newUser);
			currentUser = {
				...newUser,
				_id: result.insertedId,
			};
		}

		// Calculate deadline
		let finalDeadline: Date | undefined;

		if (dueDate && dueTime) {
			finalDeadline = new Date(`${dueDate}T${dueTime}`);
		} else if (deadline) {
			finalDeadline = new Date(deadline);
		} else if (dueDate) {
			finalDeadline = new Date(dueDate);
		}

		// Process collaborators
		const processedCollaborators = collaborators.map((collab: any) => ({
			userId: collab.userId || collab.email, // Use email as fallback ID
			mongoUserId: collab.mongoUserId,
			email: collab.email,
			displayName: collab.displayName || collab.email?.split("@")[0],
			photoURL: collab.photoURL || "",
			role: collab.role || "collaborator",
			joinedAt: new Date(),
			invitedAt: new Date(),
		}));

		// Build accessibleTo array (users who can access this goal)
		const accessibleTo = [currentUser.firebaseUid, currentUser._id.toString()];

		// Add collaborators to accessibleTo
		processedCollaborators.forEach((collab: any) => {
			if (collab.userId && !accessibleTo.includes(collab.userId)) {
				accessibleTo.push(collab.userId);
			}
			if (collab.mongoUserId && !accessibleTo.includes(collab.mongoUserId)) {
				accessibleTo.push(collab.mongoUserId);
			}
		});

		// Create the goal
		const newGoal = {
			// Owner information
			userId: currentUser._id, // Store as ObjectId
			userFirebaseUid: currentUser.firebaseUid, // Also store firebase UID
			ownerDetails: {
				id: currentUser._id.toString(),
				firebaseUid: currentUser.firebaseUid,
				email: currentUser.email,
				displayName: currentUser.displayName,
				photoURL: currentUser.photoURL,
			},

			// Goal details
			title,
			description: description || "",
			category: category || "Others",
			priority: (priority || "medium").toLowerCase(),
			deadline: finalDeadline,
			dueDate,
			dueTime,

			// Tasks and progress
			tasks: [],
			completed: false,
			progress: 0,

			// AI features
			aiSuggestions: [],

			// Collaboration
			isCollaborative: isCollaborative || processedCollaborators.length > 0,
			collaborators: processedCollaborators,
			pendingInvitations: [],
			accessibleTo,

			// Additional fields
			tags: [],
			color: "#3B82F6", // Default blue
			icon: "🎯",
			recurring: false,

			// Timestamps
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		console.log("📝 Saving goal to database");

		const result = await db.collection("goals").insertOne(newGoal);
		const goalId = result.insertedId;

		// Also create entry in user_goals collection for the owner
		try {
			await db.collection("user_goals").insertOne({
				userId: currentUser.firebaseUid,
				goalId: goalId.toString(),
				role: "owner",
				addedAt: new Date(),
				status: "active",
				isCollaborative: newGoal.isCollaborative,
			});
			console.log("✅ Added to user_goals collection");
		} catch (error) {
			console.log("ℹ️ Could not add to user_goals collection:", error);
		}

		// Create entries for collaborators in user_goals
		for (const collab of processedCollaborators) {
			try {
				await db.collection("user_goals").insertOne({
					userId: collab.userId || collab.email,
					goalId: goalId.toString(),
					role: "collaborator",
					addedAt: new Date(),
					status: "invited", // Will change to "active" when they accept
					isCollaborative: true,
					inviterId: currentUser.firebaseUid,
					inviterName: currentUser.displayName,
					inviterEmail: currentUser.email,
				});
			} catch (error) {
				console.log(
					`ℹ️ Could not add collaborator ${collab.email} to user_goals`
				);
			}
		}

		// Prepare response
		const createdGoal = {
			...newGoal,
			id: goalId.toString(),
			userId: currentUser._id.toString(),
			deadline: finalDeadline?.toISOString(),
			createdAt: newGoal.createdAt.toISOString(),
			updatedAt: newGoal.updatedAt.toISOString(),
		};

		console.log("✅ Created goal:", {
			id: createdGoal.id,
			title: createdGoal.title,
			isCollaborative: createdGoal.isCollaborative,
			collaborators: createdGoal.collaborators.length,
		});

		return NextResponse.json(createdGoal, { status: 201 });
	} catch (error: any) {
		console.error("❌ Create goal error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{
				error: {
					message: "Failed to create goal",
					details: error.message,
				},
			},
			{ status: 500 }
		);
	}
}

// Handle OPTIONS requests for CORS
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

	response.headers.set(
		"Access-Control-Allow-Methods",
		"GET, POST, PUT, DELETE, OPTIONS"
	);
	response.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization"
	);
	response.headers.set("Access-Control-Allow-Credentials", "true");
	response.headers.set("Access-Control-Max-Age", "86400");

	return response;
}
