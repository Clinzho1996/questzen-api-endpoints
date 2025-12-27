// app/api/goals/route.ts
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
			{ projection: { _id: 1, firebaseUid: 1, email: 1, displayName: 1 } }
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
			};
		}

		// Get ALL possible identifiers for this user
		const userFirebaseUid = currentUser.firebaseUid || user.userId;
		const userMongoId = currentUser._id;
		const userMongoIdString = userMongoId.toString();
		const userEmail = currentUser.email;

		console.log("👤 Current user identifiers:", {
			firebaseUid: userFirebaseUid,
			mongoId: userMongoIdString,
			email: userEmail,
		});

		// DEBUG: Check what's in the database
		// 1. Goals where user is owner
		const ownerGoals = await db
			.collection("goals")
			.find({
				$or: [
					{ userId: userMongoId },
					{ userId: userFirebaseUid },
					{ userId: userMongoIdString },
				],
			})
			.toArray();

		console.log(`👑 Goals where user is owner: ${ownerGoals.length}`);

		// 2. Goals where user is collaborator
		const collabGoals = await db
			.collection("goals")
			.find({
				$or: [
					{ "collaborators.userId": userFirebaseUid },
					{ "collaborators.userId": userMongoIdString },
					{ "collaborators.mongoUserId": userMongoIdString },
					{ "collaborators.email": userEmail },
				],
			})
			.toArray();

		console.log(`🤝 Goals where user is collaborator: ${collabGoals.length}`);
		collabGoals.forEach((g, i) => {
			console.log(
				`   ${i + 1}. ${g.title} - Collaborators:`,
				g.collaborators?.map((c: any) => ({
					userId: c.userId,
					email: c.email,
					matches: c.userId === userFirebaseUid || c.email === userEmail,
				}))
			);
		});

		// 3. Goals where user is in accessibleTo
		const accessibleGoals = await db
			.collection("goals")
			.find({
				accessibleTo: {
					$in: [userFirebaseUid, userMongoIdString, userMongoId],
				},
			})
			.toArray();

		console.log(`🔓 Goals in accessibleTo: ${accessibleGoals.length}`);

		// 4. Check user_goals collection
		let userGoalsEntries: any = [];
		try {
			userGoalsEntries = await db
				.collection("user_goals")
				.find({
					userId: userFirebaseUid,
				})
				.toArray();
			console.log(`📋 Goals in user_goals: ${userGoalsEntries.length}`);
		} catch (error) {
			console.log("ℹ️ user_goals collection doesn't exist");
		}

		// Build comprehensive query
		const queryConditions: any[] = [];

		// 1. User is owner (all possible ID formats)
		queryConditions.push({
			$or: [
				{ userId: userMongoId },
				{ userId: userFirebaseUid },
				{ userId: userMongoIdString },
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

		// 4. Goals from user_goals collection
		if (userGoalsEntries.length > 0) {
			const goalIds = userGoalsEntries
				.map((ug: any) => {
					try {
						return new ObjectId(ug.goalId);
					} catch {
						return ug.goalId;
					}
				})
				.filter(Boolean);

			if (goalIds.length > 0) {
				queryConditions.push({
					_id: { $in: goalIds },
				});
			}
		}

		console.log(
			"🔍 Executing final query with conditions:",
			queryConditions.length
		);

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
			// Determine user's role
			let isOwner = false;
			let isCollaborator = false;

			// Check if user is owner
			if (goal.userId) {
				if (goal.userId instanceof ObjectId) {
					isOwner = goal.userId.equals(userMongoId);
				} else if (typeof goal.userId === "string") {
					isOwner =
						goal.userId === userFirebaseUid ||
						goal.userId === userMongoIdString;
				}
			}

			// Check if user is collaborator
			if (!isOwner && goal.collaborators) {
				isCollaborator = goal.collaborators.some(
					(collab: any) =>
						collab.userId === userFirebaseUid ||
						collab.userId === userMongoIdString ||
						collab.mongoUserId === userMongoIdString ||
						collab.email === userEmail
				);
			}

			// Determine role
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

			// Build participants array
			const participants = [];

			// Add owner if not current user
			if (goal.userId && !isOwner) {
				// Try to get owner details
				let ownerName = "Goal Owner";
				let ownerAvatar = `https://ui-avatars.com/api/?name=Owner&background=random`;

				if (goal.ownerDetails) {
					ownerName = goal.ownerDetails.displayName || ownerName;
					ownerAvatar = goal.ownerDetails.photoURL || ownerAvatar;
				}

				participants.push({
					id: goal.userId?.toString?.(),
					name: ownerName,
					avatar: ownerAvatar,
					role: "owner",
				});
			}

			// Add collaborators (excluding current user)
			if (goal.collaborators) {
				goal.collaborators.forEach((collab: any) => {
					const isCurrentUser =
						collab.userId === userFirebaseUid ||
						collab.userId === userMongoIdString ||
						collab.email === userEmail;

					if (!isCurrentUser) {
						participants.push({
							id: collab.userId || collab.mongoUserId,
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
				role,
				isCollaborative,
				participants,
				collaborators: goal.collaborators || [],
				isOwner,
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
