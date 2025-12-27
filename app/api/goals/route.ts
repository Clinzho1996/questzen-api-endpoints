// app/api/goals/route.ts
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		console.log("🔐 Auth user from requireAuth:", {
			userId: user.userId,
			email: user.email,
		});

		// Get current user info - try multiple lookup methods
		let currentUser = null;

		// Method 1: Try firebaseUid
		if (user.userId) {
			currentUser = await db
				.collection("users")
				.findOne(
					{ firebaseUid: user.userId },
					{ projection: { _id: 1, firebaseUid: 1, email: 1 } }
				);
		}

		// Method 2: Try by email
		if (!currentUser && user.email) {
			currentUser = await db
				.collection("users")
				.findOne(
					{ email: user.email.toLowerCase().trim() },
					{ projection: { _id: 1, firebaseUid: 1, email: 1 } }
				);
		}

		// Method 3: Try by _id if it looks like ObjectId
		if (!currentUser && user.userId && user.userId.length === 24) {
			try {
				const objectId = new ObjectId(user.userId);
				currentUser = await db
					.collection("users")
					.findOne(
						{ _id: objectId },
						{ projection: { _id: 1, firebaseUid: 1, email: 1 } }
					);
			} catch {
				// ignore invalid ObjectId
			}
		}

		// Method 4: Auto-create user if not found (for Firebase-authenticated users)
		if (!currentUser) {
			console.log("🔄 User not found in MongoDB, creating new user...");

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
			};

			console.log("✅ Created new user:", currentUser);
		}

		console.log("✅ Found/created user:", {
			_id: currentUser._id,
			firebaseUid: currentUser.firebaseUid,
			email: currentUser.email,
		});

		const userId = currentUser.firebaseUid || currentUser._id.toString();
		const userIdObjectId = currentUser._id;

		console.log("🔍 Fetching goals for user IDs:", {
			stringId: userId,
			objectId: userIdObjectId,
		});

		// DEBUG: Log all goals to see what's in the database
		const allGoals = await db.collection("goals").find({}).limit(5).toArray();
		console.log(
			"📁 Sample goals in database:",
			allGoals.map((g) => ({
				id: g._id?.toString?.(),
				userId: g.userId,
				userIdType: typeof g.userId,
				title: g.title,
				collaborators: g.collaborators?.map((c: any) => c.userId),
			}))
		);

		// Build query for goals
		const queryConditions: any[] = [];

		// Check if userIdObjectId is valid ObjectId
		if (userIdObjectId) {
			queryConditions.push({ userId: userIdObjectId });

			// Also check if userId is stored as ObjectId string
			try {
				if (ObjectId.isValid(userId)) {
					queryConditions.push({ userId: new ObjectId(userId) });
				}
			} catch (error) {
				console.log("❌ userId is not a valid ObjectId:", userId);
			}
		}

		// Check string userId
		queryConditions.push({ userId: userId });

		// Check collaborators
		queryConditions.push({ "collaborators.userId": userId });
		if (userIdObjectId) {
			queryConditions.push({
				"collaborators.userId": userIdObjectId.toString(),
			});
		}

		// Check accessibleTo
		queryConditions.push({ accessibleTo: userId });
		if (userIdObjectId) {
			queryConditions.push({ accessibleTo: userIdObjectId.toString() });
		}

		console.log("🔍 Query conditions:", queryConditions);

		// Fetch goals
		const goals = await db
			.collection("goals")
			.find({
				$or: queryConditions,
			})
			.sort({ createdAt: -1 })
			.toArray();

		console.log(`✅ Found ${goals.length} goals for user`);

		// Transform goals
		const transformedGoals = goals.map((goal) => {
			// Determine user's role
			let isOwner = false;

			// Check ownership by comparing IDs
			if (goal.userId) {
				if (typeof goal.userId === "object" && userIdObjectId) {
					// userId is ObjectId
					isOwner = goal.userId.toString() === userIdObjectId.toString();
				} else if (typeof goal.userId === "string") {
					// userId is string
					isOwner = goal.userId === userId;
				}
			}

			const role = isOwner ? "owner" : "collaborator";

			return {
				...goal,
				id: goal._id.toString(),
				_id: undefined,
				role,
				isCollaborative: goal.isCollaborative || role === "collaborator",
				// Ensure participants field exists for UI
				participants:
					goal.collaborators?.map((collab: any) => ({
						id: collab.userId,
						name: collab.displayName || collab.email?.split("@")[0] || "User",
						avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(
							collab.displayName || collab.email || "U"
						)}&background=random`,
					})) || [],
			};
		});

		console.log(
			"📤 Returning goals:",
			transformedGoals.map((g) => ({
				id: g.id,
				role: g.role,
				isCollaborative: g.isCollaborative,
				participants: g.participants?.length,
			}))
		);

		return NextResponse.json(transformedGoals);
	} catch (error: any) {
		console.error("❌ Get goals error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{
					error: { message: "Unauthorized" },
				},
				{ status: 401 }
			);
		}

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

export async function POST(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const body = await request.json();
		const { title, description, category, priority, deadline } = body;

		console.log("🎯 Creating goal for user:", {
			userId: user.userId,
			email: user.email,
		});

		// Validation
		if (!title || !category) {
			return NextResponse.json(
				{
					error: { message: "Title and category are required" },
				},
				{ status: 400 }
			);
		}

		const db = await getDatabase();

		// Get or create user
		let currentUser = await db
			.collection("users")
			.findOne({ firebaseUid: user.userId }, { projection: { _id: 1 } });

		// Create user if not found
		if (!currentUser) {
			console.log("🔄 Creating new user for goal creation...");

			const newUser = {
				firebaseUid: user.userId,
				email: user.email || "",
				displayName: user.email?.split("@")[0] || "QuestZen User",
				// ... other fields
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const result = await db.collection("users").insertOne(newUser);
			currentUser = { _id: result.insertedId };
		}

		const newGoal = {
			userId: currentUser._id,
			title,
			description: description || "",
			category,
			priority: priority || "medium",
			deadline: deadline ? new Date(deadline) : undefined,
			tasks: [],
			completed: false,
			progress: 0,
			aiSuggestions: [],
			isCollaborative: false,
			collaborators: [],
			pendingInvitations: [],
			accessibleTo: [],
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const result = await db.collection("goals").insertOne(newGoal);

		const createdGoal = {
			...newGoal,
			id: result.insertedId.toString(),
			userId: currentUser._id.toString(),
		};

		console.log("✅ Created goal:", {
			id: createdGoal.id,
			title: createdGoal.title,
			userId: createdGoal.userId,
		});

		return NextResponse.json(createdGoal, { status: 201 });
	} catch (error: any) {
		console.error("❌ Create goal error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{
					error: { message: "Unauthorized" },
				},
				{ status: 401 }
			);
		}

		return NextResponse.json(
			{
				error: {
					message: "Server error",
					details: error.message,
				},
			},
			{ status: 500 }
		);
	}
}
