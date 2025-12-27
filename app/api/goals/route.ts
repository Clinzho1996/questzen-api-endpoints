// app/api/goals/route.ts
import { requireAuth } from "@/lib/auth";
import { Goal } from "@/lib/models/Goal";
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		// Get current user info to use correct ID format
		const currentUser = await db
			.collection("users")
			.findOne(
				{ firebaseUid: user.userId },
				{ projection: { _id: 1, firebaseUid: 1 } }
			);

		if (!currentUser) {
			return NextResponse.json(
				{
					error: { message: "User not found" },
				},
				{ status: 404 }
			);
		}

		const userId = currentUser.firebaseUid || currentUser._id.toString();
		const userIdObjectId = currentUser._id;

		console.log("🔍 Fetching goals for user:", { userId, userIdObjectId });

		// Fetch goals where:
		// 1. User is the owner (userId matches)
		// 2. OR User is a collaborator (collaborators array contains user)
		const goals = await db
			.collection("goals")
			.find({
				$or: [
					{ userId: userIdObjectId }, // User created these goals
					{ userId: userId }, // Also check if userId is stored as string
					{ "collaborators.userId": userId }, // User is a collaborator
					{ "collaborators.userId": userIdObjectId.toString() }, // Also check ObjectId string
				],
			})
			.sort({ createdAt: -1 })
			.toArray();

		console.log(`✅ Found ${goals.length} goals for user`);

		return NextResponse.json(
			goals.map((goal) => {
				// Determine user's role for this goal
				const isOwner =
					goal.userId?.toString() === userIdObjectId?.toString() ||
					goal.userId === userId;
				const role = isOwner ? "owner" : "collaborator";

				return {
					...goal,
					id: goal._id.toString(),
					_id: undefined,
					role, // Add role field
					isCollaborative: goal.isCollaborative || role === "collaborator",
				};
			})
		);
	} catch (error: any) {
		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{
					error: { message: "Unauthorized" },
				},
				{ status: 401 }
			);
		}
		console.error("Get goals error:", error);
		return NextResponse.json(
			{
				error: { message: "Server error" },
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

		// Get user's MongoDB _id
		const currentUser = await db
			.collection("users")
			.findOne({ firebaseUid: user.userId }, { projection: { _id: 1 } });

		if (!currentUser) {
			return NextResponse.json(
				{
					error: { message: "User not found" },
				},
				{ status: 404 }
			);
		}

		const newGoal: Omit<Goal, "_id"> = {
			userId: currentUser._id, // Use MongoDB _id
			title,
			description: description || "",
			category,
			priority: priority || "medium",
			deadline: deadline ? new Date(deadline) : undefined,
			tasks: [],
			completed: false,
			aiSuggestions: [],
			createdAt: new Date(),
			updatedAt: new Date(),
			isCollaborative: false,
			collaborators: [],
			pendingInvitations: [],
		};

		const result = await db.collection("goals").insertOne(newGoal);

		return NextResponse.json(
			{
				...newGoal,
				id: result.insertedId.toString(),
				userId: currentUser._id.toString(),
			},
			{ status: 201 }
		);
	} catch (error: any) {
		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{
					error: { message: "Unauthorized" },
				},
				{ status: 401 }
			);
		}
		console.error("Create goal error:", error);
		return NextResponse.json(
			{
				error: { message: "Server error" },
			},
			{ status: 500 }
		);
	}
}
