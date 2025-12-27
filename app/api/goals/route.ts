// app/api/goals/route.ts - GET method
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

		// Get or create user
		let currentUser = await db
			.collection("users")
			.findOne(
				{ firebaseUid: user.userId },
				{ projection: { _id: 1, firebaseUid: 1, email: 1 } }
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
			};
		}

		const userIdString = currentUser.firebaseUid || currentUser._id.toString();
		const userIdObjectId = currentUser._id;

		console.log("👤 Current user in MongoDB:", {
			_id: currentUser._id.toString(),
			firebaseUid: currentUser.firebaseUid,
			email: currentUser.email,
		});

		// DEBUG: Check what goals exist in the database
		const allGoalsCount = await db.collection("goals").countDocuments();
		console.log(`📊 Total goals in database: ${allGoalsCount}`);

		// Get a sample of goals to debug
		const sampleGoals = await db
			.collection("goals")
			.find({})
			.limit(5)
			.toArray();
		console.log(
			"📁 Sample goals:",
			sampleGoals.map((g) => ({
				_id: g._id?.toString?.(),
				title: g.title,
				userId: g.userId,
				userIdType: typeof g.userId,
				isObjectId: g.userId instanceof ObjectId,
				collaborators: g.collaborators?.map((c: any) => c.userId),
			}))
		);

		// Build the query - FIXED: Only use conditions that actually exist
		const queryConditions: any[] = [];

		// Condition 1: User is the owner (by ObjectId)
		if (userIdObjectId) {
			queryConditions.push({ userId: userIdObjectId });
		}

		// Condition 2: User is the owner (by string)
		queryConditions.push({ userId: userIdString });

		// Condition 3: User is a collaborator
		queryConditions.push({
			"collaborators.userId": {
				$in: [userIdString, userIdObjectId?.toString()].filter(Boolean),
			},
		});

		// Condition 4: User has access via accessibleTo
		queryConditions.push({
			accessibleTo: {
				$in: [userIdString, userIdObjectId?.toString()].filter(Boolean),
			},
		});

		console.log(
			"🔍 Query conditions:",
			JSON.stringify(queryConditions, null, 2)
		);

		// Execute query
		const goals = await db
			.collection("goals")
			.find({
				$or: queryConditions,
			})
			.sort({ createdAt: -1 })
			.toArray();

		console.log(`✅ Found ${goals.length} goals matching query`);

		// Transform goals
		const transformedGoals = goals.map((goal) => {
			// Determine user's role
			let isOwner = false;

			// Check if user is owner
			if (goal.userId) {
				if (goal.userId instanceof ObjectId) {
					isOwner = goal.userId.equals(userIdObjectId);
				} else if (typeof goal.userId === "string") {
					isOwner =
						goal.userId === userIdString ||
						goal.userId === userIdObjectId?.toString();
				}
			}

			// Check if user is collaborator (if not owner)
			let isCollaborator = false;
			if (!isOwner && goal.collaborators) {
				isCollaborator = goal.collaborators.some(
					(collab: any) =>
						collab.userId === userIdString ||
						collab.userId === userIdObjectId?.toString()
				);
			}

			const role = isOwner
				? "owner"
				: isCollaborator
				? "collaborator"
				: "owner"; // fallback
			const isCollaborative =
				goal.isCollaborative ||
				isCollaborator ||
				goal.collaborators?.length > 0;

			// Build participants array
			const participants = [];

			// Add owner first
			if (goal.userId && !isOwner) {
				participants.push({
					id: goal.userId?.toString?.(),
					name: "Goal Owner",
					avatar: `https://ui-avatars.com/api/?name=Owner&background=random`,
				});
			}

			// Add collaborators
			if (goal.collaborators) {
				goal.collaborators.forEach((collab: any) => {
					if (
						collab.userId !== userIdString &&
						collab.userId !== userIdObjectId?.toString()
					) {
						participants.push({
							id: collab.userId,
							name:
								collab.displayName ||
								collab.email?.split("@")[0] ||
								"Collaborator",
							avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(
								collab.displayName || collab.email || "C"
							)}&background=random`,
						});
					}
				});
			}

			return {
				...goal,
				id: goal._id.toString(),
				_id: undefined,
				role,
				isCollaborative,
				participants,
				// Ensure progress is a number
				progress:
					typeof goal.progress === "number"
						? goal.progress
						: goal.completed
						? 100
						: 0,
				// Ensure category is one of the allowed values
				category: goal.category || "Others",
				// Ensure priority is one of the allowed values
				priority: goal.priority || "Medium",
			};
		});

		console.log("📤 Returning transformed goals:", transformedGoals.length);

		const response = NextResponse.json(transformedGoals);

		// Add CORS headers
		const origin = request.headers.get("origin") || "";
		const allowedOrigins = [
			"https://questzenai.devclinton.org",
			"http://localhost:5173",
			"http://localhost:3000",
		];

		if (allowedOrigins.includes(origin) || origin.includes("localhost")) {
			response.headers.set("Access-Control-Allow-Origin", origin);
		}
		response.headers.set("Access-Control-Allow-Credentials", "true");

		return response;
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
