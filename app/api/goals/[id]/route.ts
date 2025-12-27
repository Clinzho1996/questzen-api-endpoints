// app/api/goals/[id]/route.ts
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const user = await requireAuth(request);
		const params = await context.params;
		const body = await request.json();
		const db = await getDatabase();

		// Get current user info
		const currentUser = await db
			.collection("users")
			.findOne(
				{ firebaseUid: user.userId },
				{ projection: { _id: 1, firebaseUid: 1 } }
			);

		if (!currentUser) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		const userId = currentUser.firebaseUid || currentUser._id.toString();
		const userIdObjectId = currentUser._id;

		// Verify goal belongs to user OR user is a collaborator
		const goal = await db.collection("goals").findOne({
			_id: new ObjectId(params.id),
			$or: [
				{ userId: userIdObjectId },
				{ userId: userId },
				{ "collaborators.userId": userId },
				{ "collaborators.userId": userIdObjectId.toString() },
			],
		});

		if (!goal) {
			return NextResponse.json(
				{ error: { message: "Goal not found or no access" } },
				{ status: 404 }
			);
		}

		// Check if user is owner (can update all fields) or collaborator (limited updates)
		const isOwner =
			goal.userId?.toString() === userIdObjectId?.toString() ||
			goal.userId === userId;

		// Build update object
		const updateData: any = {
			updatedAt: new Date(),
		};

		// Owners can update all fields
		if (isOwner) {
			if (body.title !== undefined) updateData.title = body.title;
			if (body.description !== undefined)
				updateData.description = body.description;
			if (body.category !== undefined) updateData.category = body.category;
			if (body.priority !== undefined) updateData.priority = body.priority;
			if (body.deadline !== undefined)
				updateData.deadline = body.deadline ? new Date(body.deadline) : null;
			if (body.tasks !== undefined) updateData.tasks = body.tasks;

			if (body.completed !== undefined) {
				updateData.completed = body.completed;
				if (body.completed) {
					updateData.completedAt = new Date();
				}
			}
		} else {
			// Collaborators can only update tasks and completion status
			if (body.tasks !== undefined) updateData.tasks = body.tasks;

			if (body.completed !== undefined) {
				updateData.completed = body.completed;
				if (body.completed) {
					updateData.completedAt = new Date();
				}
			}
		}

		await db
			.collection("goals")
			.updateOne({ _id: new ObjectId(params.id) }, { $set: updateData });

		const updatedGoal = await db.collection("goals").findOne({
			_id: new ObjectId(params.id),
		});

		return NextResponse.json({
			...updatedGoal,
			id: updatedGoal!._id.toString(),
			_id: undefined,
			role: isOwner ? "owner" : "collaborator",
		});
	} catch (error: any) {
		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		console.error("Update goal error:", error);
		return NextResponse.json(
			{ error: { message: "Server error" } },
			{ status: 500 }
		);
	}
}

export async function DELETE(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const user = await requireAuth(request);
		const params = await context.params;
		const db = await getDatabase();

		// Get current user info
		const currentUser = await db
			.collection("users")
			.findOne(
				{ firebaseUid: user.userId },
				{ projection: { _id: 1, firebaseUid: 1 } }
			);

		if (!currentUser) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		const userIdObjectId = currentUser._id;
		const userId = currentUser.firebaseUid || currentUser._id.toString();

		// Verify goal belongs to user (only owners can delete)
		const goal = await db.collection("goals").findOne({
			_id: new ObjectId(params.id),
			userId: userIdObjectId, // Only allow deletion by owner
		});

		if (!goal) {
			return NextResponse.json(
				{
					error: {
						message: "Goal not found or you don't have permission to delete",
					},
				},
				{ status: 404 }
			);
		}

		const result = await db.collection("goals").deleteOne({
			_id: new ObjectId(params.id),
			userId: userIdObjectId,
		});

		if (result.deletedCount === 0) {
			return NextResponse.json(
				{ error: { message: "Goal not found" } },
				{ status: 404 }
			);
		}

		// Remove from collaborators' lists if it was collaborative
		if (goal.collaborators && goal.collaborators.length > 0) {
			// You might want to notify collaborators that the goal was deleted
			// Create notifications for collaborators
			for (const collaborator of goal.collaborators) {
				await db.collection("notifications").insertOne({
					userId: collaborator.userId,
					type: "goal_deleted",
					title: "🗑️ Goal Deleted",
					message: `${goal.title} was deleted by the owner`,
					data: {
						goalId: params.id,
						goalTitle: goal.title,
						ownerId: userId,
					},
					read: false,
					createdAt: new Date(),
				});
			}
		}

		return NextResponse.json({
			message: "Goal deleted successfully",
		});
	} catch (error: any) {
		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		console.error("Delete goal error:", error);
		return NextResponse.json(
			{ error: { message: "Server error" } },
			{ status: 500 }
		);
	}
}
