import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

// GET all goals AND habits for the authenticated user
export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		console.log("🔐 Auth user from requireAuth:", {
			userId: user.userId,
			email: user.email,
			firebaseUid: user.firebaseUid,
			provider: user.provider,
			isMongoDBId: /^[0-9a-fA-F]{24}$/.test(user.userId),
		});

		// Get current user from MongoDB - UPDATED FOR CUSTOM JWT
		let currentUser = null;

		// Priority 1: Look by MongoDB _id if userId is MongoDB ID
		if (user.userId && /^[0-9a-fA-F]{24}$/.test(user.userId)) {
			try {
				currentUser = await db.collection("users").findOne(
					{ _id: new ObjectId(user.userId) },
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
				console.log("✅ Found user by MongoDB _id");
			} catch (error) {
				console.log("⚠️ Invalid ObjectId format for user lookup");
			}
		}

		// Priority 2: Look by firebaseUid
		if (!currentUser && user.userId) {
			currentUser = await db.collection("users").findOne(
				{ firebaseUid: user.userId },
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
			console.log("✅ Found user by firebaseUid");
		}

		// Priority 3: Look by email
		if (!currentUser && user.email) {
			currentUser = await db.collection("users").findOne(
				{ email: user.email.toLowerCase().trim() },
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
			console.log("✅ Found user by email");
		}

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
				firebaseUid: newUser.firebaseUid,
				email: newUser.email,
				displayName: newUser.displayName,
				photoURL: "",
			};
			console.log("✅ Created new user");
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

		// =========== GET USER'S HABITS ===========
		console.log("🔄 Fetching user habits...");
		const userHabits = await db
			.collection("habits")
			.find({
				userId: userMongoId,
				isPredefined: false,
			})
			.sort({ createdAt: -1 })
			.toArray();

		const transformedHabits = userHabits.map((habit) => ({
			id: habit._id.toString(),
			name: habit.name,
			description: habit.description || "",
			category: habit.category || "custom",
			icon: habit.icon || "✅",
			color: habit.color || "#3B82F6",
			settings: habit.settings || {
				timesPerWeek: 7,
				timeOfDay: ["any"],
				reminders: [],
				duration: 5,
			},
			stats: habit.stats || {
				totalCompletions: 0,
				bestStreak: 0,
				currentStreak: 0,
				successRate: 0,
				averageCompletionTime: 0,
				totalMinutesSpent: 0,
			},
			completedToday: false, // This will be calculated from habit_completions
			progress: 0, // Calculated progress based on completions
			isActive: true,
			createdAt: habit.createdAt?.toISOString?.() || new Date().toISOString(),
			updatedAt: habit.updatedAt?.toISOString?.() || new Date().toISOString(),
			tags: habit.tags || [],
			isPredefined: false,
			isFromPredefined: habit.isFromPredefined || false,
		}));

		console.log(`✅ Found ${userHabits.length} habits for user`);

		// Get predefined habits
		const predefinedHabits = await db
			.collection("habits")
			.find({
				isPredefined: true,
			})
			.toArray();

		const transformedPredefinedHabits = predefinedHabits.map((habit) => ({
			id: habit._id.toString(),
			name: habit.name,
			description: habit.description || "",
			category: habit.category || "general",
			icon: habit.icon || "🌟",
			color: habit.color || "#6B7280",
			difficulty: habit.difficulty || "medium",
			timeCommitment: habit.timeCommitment || 5,
			benefits: habit.benefits || [],
			tags: habit.tags || [],
			defaultSettings: habit.defaultSettings || {},
			isPredefined: true,
		}));

		console.log(`✅ Found ${predefinedHabits.length} predefined habits`);

		// Get today's completions for habits
		const today = new Date().toISOString().split("T")[0];
		const habitIds = userHabits.map((h) => h._id);

		let todayCompletions: any = [];
		if (habitIds.length > 0) {
			todayCompletions = await db
				.collection("habit_completions")
				.find({
					habitId: { $in: habitIds },
					date: today,
					userId: userMongoId,
				})
				.toArray();
		}

		// Mark habits as completed today
		const completedHabitIds = new Set(
			todayCompletions
				.filter((c: any) => c.completed)
				.map((c: any) => c.habitId.toString())
		);

		const habitsWithCompletion = transformedHabits.map((habit) => ({
			...habit,
			completedToday: completedHabitIds.has(habit.id),
			progress: completedHabitIds.has(habit.id) ? 100 : 0,
		}));

		// =========== GET USER'S GOALS ===========
		console.log("🔄 Fetching user goals...");

		// Build comprehensive query for goals
		const queryConditions: any[] = [];

		// 1. User is owner (all possible ID formats)
		queryConditions.push({
			$or: [
				{ userId: userMongoId }, // ObjectId
				{ userId: userFirebaseUid }, // Firebase UID string
				{ userId: userMongoIdString }, // MongoDB ID string
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

		console.log(
			"🔍 Executing goals query with conditions:",
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

		// Transform goals for frontend - FIXED ROLE DETERMINATION
		const transformedGoals = goals.map((goal) => {
			// Get the goal's owner ID
			const goalOwnerId = goal.userId;

			// CRITICAL FIX: Determine if current user is owner
			let isOwner = false;

			// Case 1: goalOwnerId is ObjectId
			if (goalOwnerId instanceof ObjectId) {
				isOwner = goalOwnerId.equals(userMongoId);
			}
			// Case 2: goalOwnerId is string - could be firebaseUid or MongoDB ID string
			else if (typeof goalOwnerId === "string") {
				// Try all possible comparisons
				isOwner =
					goalOwnerId === userFirebaseUid || // Firebase UID match
					goalOwnerId === userMongoIdString || // MongoDB ID string match
					(goalOwnerId.length === 24 &&
						/^[0-9a-fA-F]{24}$/.test(goalOwnerId) &&
						new ObjectId(goalOwnerId).equals(userMongoId)); // MongoDB ObjectId comparison
			}

			// Case 3: Check ownerDetails
			if (!isOwner && goal.ownerDetails) {
				isOwner =
					goal.ownerDetails.id === userMongoIdString ||
					goal.ownerDetails.firebaseUid === userFirebaseUid ||
					goal.ownerDetails.email === userEmail;
			}

			// Determine if user is collaborator
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

			// Determine role - OWNER TAKES PRIORITY
			const role = isOwner
				? "owner"
				: isCollaborator
				? "collaborator"
				: "viewer";

			// Determine if collaborative
			const isCollaborative =
				isCollaborator ||
				(goal.collaborators && goal.collaborators.length > 0) ||
				goal.isCollaborative === true;

			console.log(`Goal "${goal.title}":`, {
				isOwner,
				isCollaborator,
				role,
				isCollaborative,
				goalOwnerId: goalOwnerId?.toString?.(),
				userMongoId: userMongoIdString,
			});

			// Build participants array
			const participants = [];

			// Add owner first
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
			} else if (goalOwnerId) {
				// Fallback if no ownerDetails
				participants.push({
					id: goalOwnerId?.toString?.(),
					name: "Goal Owner",
					avatar: `https://ui-avatars.com/api/?name=Owner&background=random`,
					role: "owner",
				});
			}

			// Add collaborators (excluding current user if they're not owner)
			if (goal.collaborators) {
				goal.collaborators.forEach((collab: any) => {
					const isCurrentUser =
						collab.userId === userFirebaseUid ||
						collab.userId === userMongoIdString ||
						collab.email === userEmail;

					if (!isCurrentUser || !isOwner) {
						// Don't add owner as collaborator
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
				userId: goal.userId?.toString?.(),
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

		console.log("📤 Returning combined data:", {
			goals: transformedGoals.length,
			habits: habitsWithCompletion.length,
			availableHabits: transformedPredefinedHabits.length,
		});

		// Return combined response
		return NextResponse.json({
			goals: transformedGoals,
			habits: habitsWithCompletion,
			availableHabits: transformedPredefinedHabits,
			stats: {
				totalGoals: transformedGoals.length,
				completedGoals: transformedGoals.filter((g) => g.completed).length,
				totalHabits: habitsWithCompletion.length,
				activeHabits: habitsWithCompletion.filter((h) => h.completedToday)
					.length,
				todayCompletions: todayCompletions.filter((c: any) => c.completed)
					.length,
			},
		});
	} catch (error: any) {
		console.error("❌ Get goals and habits error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{
				error: {
					message: "Failed to fetch data",
					details: error.message,
				},
			},
			{ status: 500 }
		);
	}
}

// POST create a new goal - UPDATED FOR CONSISTENT IDS
export async function POST(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const body = await request.json();
		const {
			type = "goal", // "goal" or "habit"
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
			// Habit specific fields
			settings,
			isPredefined,
			predefinedHabitId,
			info,
		} = body;

		console.log("🎯 Creating item with data:", {
			type,
			title,
			category,
			priority,
			isPredefined,
			predefinedHabitId,
		});

		const db = await getDatabase();

		// Get current user - UPDATED FOR CUSTOM JWT
		let currentUser = null;

		// Try MongoDB _id first
		if (user.userId && /^[0-9a-fA-F]{24}$/.test(user.userId)) {
			try {
				currentUser = await db.collection("users").findOne(
					{ _id: new ObjectId(user.userId) },
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
			} catch (error) {
				console.log("⚠️ Invalid ObjectId format");
			}
		}

		// Try firebaseUid
		if (!currentUser && user.userId) {
			currentUser = await db.collection("users").findOne(
				{ firebaseUid: user.userId },
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
		}

		// Try email
		if (!currentUser && user.email) {
			currentUser = await db.collection("users").findOne(
				{ email: user.email.toLowerCase().trim() },
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
		}

		if (!currentUser) {
			console.log("🔄 Creating new user for item creation...");
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

		// Handle habit creation
		if (type === "habit") {
			console.log("🔄 Creating new habit...");

			if (!title) {
				return NextResponse.json(
					{ error: { message: "Habit name is required" } },
					{ status: 400 }
				);
			}

			let habitData;

			if (isPredefined && predefinedHabitId) {
				// Get predefined habit
				const predefinedHabit = await db.collection("habits").findOne({
					_id: new ObjectId(predefinedHabitId),
					isPredefined: true,
				});

				if (!predefinedHabit) {
					return NextResponse.json(
						{ error: { message: "Predefined habit not found" } },
						{ status: 404 }
					);
				}

				habitData = {
					...predefinedHabit,
					_id: undefined,
					userId: currentUser._id,
					userFirebaseUid: currentUser.firebaseUid,
					isPredefined: false,
					isFromPredefined: true,
					originalHabitId: predefinedHabitId,
					settings: {
						...predefinedHabit.defaultSettings,
						...settings,
						timeOfDay: settings?.timeOfDay ||
							predefinedHabit.defaultSettings?.timeOfDay || ["any"],
						timesPerWeek:
							settings?.timesPerWeek ||
							predefinedHabit.defaultSettings?.timesPerWeek ||
							7,
						timesPerDay:
							settings?.timesPerDay ||
							predefinedHabit.defaultSettings?.timesPerDay ||
							1,
						reminders:
							settings?.reminders ||
							predefinedHabit.defaultSettings?.reminders ||
							[],
						duration:
							settings?.duration ||
							predefinedHabit.defaultSettings?.duration ||
							5,
					},
					stats: {
						totalCompletions: 0,
						bestStreak: 0,
						currentStreak: 0,
						successRate: 0,
						averageCompletionTime: 0,
						totalMinutesSpent: 0,
						completionHistory: [],
					},
					createdAt: new Date(),
					updatedAt: new Date(),
				};
			} else {
				// Custom habit
				habitData = {
					userId: currentUser._id,
					userFirebaseUid: currentUser.firebaseUid,
					name: title,
					description: description || "",
					category: category || "custom",
					isPredefined: false,
					isFromPredefined: false,
					settings: settings || {
						timeOfDay: ["any"],
						timesPerWeek: 7,
						timesPerDay: 1,
						reminders: [],
						duration: 5,
					},
					info: info || {},
					stats: {
						totalCompletions: 0,
						bestStreak: 0,
						currentStreak: 0,
						successRate: 0,
						averageCompletionTime: 0,
						totalMinutesSpent: 0,
						completionHistory: [],
					},
					tags: [],
					color: "#3B82F6",
					icon: "✅",
					createdAt: new Date(),
					updatedAt: new Date(),
				};
			}

			const result = await db.collection("habits").insertOne(habitData);
			const habitId = result.insertedId;

			// Create initial completion records for the week
			const startOfWeek = new Date();
			startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
			startOfWeek.setHours(0, 0, 0, 0);

			const weeklyCompletions = [];
			for (let i = 0; i < 7; i++) {
				const date = new Date(startOfWeek);
				date.setDate(date.getDate() + i);

				weeklyCompletions.push({
					habitId,
					userId: currentUser._id,
					date: date.toISOString().split("T")[0],
					completed: false,
					count: 0,
					notes: "",
					mood: null,
					productivity: null,
					timeSpent: 0,
					createdAt: new Date(),
					updatedAt: new Date(),
				});
			}

			await db.collection("habit_completions").insertMany(weeklyCompletions);

			const newHabit = await db.collection("habits").findOne({ _id: habitId });

			return NextResponse.json(
				{
					...newHabit,
					id: newHabit!._id.toString(),
					_id: undefined,
				},
				{ status: 201 }
			);
		}

		// Handle goal creation (original logic)
		console.log("🎯 Creating new goal...");

		if (!title || !category) {
			return NextResponse.json(
				{ error: { message: "Title and category are required" } },
				{ status: 400 }
			);
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
			userId: collab.userId || collab._id?.toString(), // Use MongoDB _id
			userFirebaseUid: collab.firebaseUid,
			email: collab.email,
			displayName: collab.displayName || collab.email?.split("@")[0],
			photoURL: collab.photoURL || "",
			role: collab.role || "collaborator",
			joinedAt: new Date(),
			invitedAt: new Date(),
		}));

		// Build accessibleTo array (users who can access this goal)
		const accessibleTo = [
			currentUser._id.toString(), // MongoDB _id string
			currentUser.firebaseUid, // Firebase UID
		].filter(Boolean);

		// Add collaborators to accessibleTo
		processedCollaborators.forEach((collab: any) => {
			if (collab.userId && !accessibleTo.includes(collab.userId)) {
				accessibleTo.push(collab.userId);
			}
			if (
				collab.userFirebaseUid &&
				!accessibleTo.includes(collab.userFirebaseUid)
			) {
				accessibleTo.push(collab.userFirebaseUid);
			}
		});

		// Check for existing goals with same email
		const existingGoalsWithEmail = await db.collection("goals").findOne({
			"ownerDetails.email": user.email,
			userId: { $ne: currentUser._id }, // Different from current user ID
		});

		if (existingGoalsWithEmail) {
			console.log(
				"⚠️ Found existing goals with same email but different user ID"
			);
			console.log("   Merging user accounts...");

			// Update all old goals to use current user ID
			await db.collection("goals").updateMany(
				{ "ownerDetails.email": user.email, userId: { $ne: currentUser._id } },
				{
					$set: {
						userId: currentUser._id,
						"ownerDetails.id": currentUser._id.toString(),
						"ownerDetails.firebaseUid": currentUser.firebaseUid,
						updatedAt: new Date(),
					},
				}
			);
		}

		// Create the goal - USE CONSISTENT ID FORMAT
		const newGoal = {
			// Owner information - STORE BOTH ID TYPES
			userId: currentUser._id, // Store as ObjectId (primary)
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
				userId: currentUser._id.toString(), // Use MongoDB _id
				userFirebaseUid: currentUser.firebaseUid,
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

		// Prepare response
		const createdGoal = {
			...newGoal,
			id: goalId.toString(),
			userId: currentUser._id.toString(), // Return as string
			deadline: finalDeadline?.toISOString(),
			createdAt: newGoal.createdAt.toISOString(),
			updatedAt: newGoal.updatedAt.toISOString(),
		};

		console.log("✅ Created goal:", {
			id: createdGoal.id,
			title: createdGoal.title,
			isCollaborative: createdGoal.isCollaborative,
			userId: createdGoal.userId,
			collaborators: createdGoal.collaborators.length,
		});

		return NextResponse.json(createdGoal, { status: 201 });
	} catch (error: any) {
		console.error("❌ Create item error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{
				error: {
					message: "Failed to create item",
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
