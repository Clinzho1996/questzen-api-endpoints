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

		console.log("🔄 PATCH Goal Request:", {
			goalId: params.id,
			userId: user.userId,
			updates: body,
		});

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

		// Handle dueDate and dueTime
		if (body.dueDate !== undefined || body.dueTime !== undefined) {
			console.log("📅 Processing date/time update:", {
				dueDate: body.dueDate,
				dueTime: body.dueTime,
				existingDueDate: goal.dueDate,
				existingDueTime: goal.dueTime,
			});

			// Get existing or new values
			const newDueDate =
				body.dueDate !== undefined ? body.dueDate : goal.dueDate;
			const newDueTime =
				body.dueTime !== undefined ? body.dueTime : goal.dueTime;

			// Update separate fields
			updateData.dueDate = newDueDate;
			updateData.dueTime = newDueTime;

			// Update combined deadline field
			if (newDueDate && newDueTime) {
				// Combine date and time into a proper Date object
				try {
					const dateTimeString = `${newDueDate}T${newDueTime}`;
					updateData.deadline = new Date(dateTimeString);
					console.log("📅 Combined deadline:", updateData.deadline);
				} catch (error) {
					console.error("❌ Error parsing date/time:", error);
					// Fallback to just date
					updateData.deadline = new Date(newDueDate);
				}
			} else if (newDueDate) {
				// Only date provided
				updateData.deadline = new Date(newDueDate);
			} else {
				// No date/time, clear deadline
				updateData.deadline = null;
			}
		} else if (body.deadline !== undefined) {
			// Legacy support for deadline field
			updateData.deadline = body.deadline ? new Date(body.deadline) : null;
		}

		// Owners can update all fields
		if (isOwner) {
			if (body.title !== undefined) updateData.title = body.title;
			if (body.description !== undefined)
				updateData.description = body.description;
			if (body.category !== undefined) updateData.category = body.category;
			if (body.priority !== undefined) updateData.priority = body.priority;
			if (body.tasks !== undefined) updateData.tasks = body.tasks;

			// Handle progress updates
			if (body.progress !== undefined) {
				updateData.progress = body.progress;
			}

			if (body.completed !== undefined) {
				updateData.completed = body.completed;
				if (body.completed) {
					updateData.completedAt = new Date();
					// Auto-set progress to 100% when completed
					if (body.progress === undefined) {
						updateData.progress = 100;
					}
				}
			}
		} else {
			// Collaborators can only update tasks and completion status
			if (body.tasks !== undefined) updateData.tasks = body.tasks;

			if (body.completed !== undefined) {
				updateData.completed = body.completed;
				if (body.completed) {
					updateData.completedAt = new Date();
					// Auto-set progress to 100% when completed
					if (body.progress === undefined) {
						updateData.progress = 100;
					}
				}
			}
		}

		// Also handle progress updates separately (for toggleGoal)
		if (body.progress !== undefined) {
			updateData.progress = body.progress;
		}

		console.log("📝 Update data being applied:", updateData);

		// Perform the update
		await db
			.collection("goals")
			.updateOne({ _id: new ObjectId(params.id) }, { $set: updateData });

		// Get updated goal
		const updatedGoal = await db.collection("goals").findOne({
			_id: new ObjectId(params.id),
		});

		if (!updatedGoal) {
			return NextResponse.json(
				{ error: { message: "Failed to retrieve updated goal" } },
				{ status: 500 }
			);
		}

		// Transform the response
		const responseGoal = {
			...updatedGoal,
			id: updatedGoal._id.toString(),
			_id: undefined,
			userId: updatedGoal.userId?.toString?.(),
			role: isOwner ? "owner" : "collaborator",
			// Ensure dueDate and dueTime are returned
			dueDate: updatedGoal.dueDate,
			dueTime: updatedGoal.dueTime,
			deadline: updatedGoal.deadline?.toISOString?.(),
			createdAt: updatedGoal.createdAt?.toISOString?.(),
			updatedAt: updatedGoal.updatedAt?.toISOString?.(),
		};

		console.log("✅ Updated goal response:", {
			id: responseGoal.id,
			dueDate: responseGoal.dueDate,
			dueTime: responseGoal.dueTime,
			deadline: responseGoal.deadline,
		});

		return NextResponse.json(responseGoal);
	} catch (error: any) {
		console.error("❌ PATCH goal error:", error);

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
					details:
						process.env.NODE_ENV === "development" ? error.message : undefined,
				},
			},
			{ status: 500 }
		);
	}
}

// app/api/goals/[id]/route.ts - UPDATE THE DELETE FUNCTION
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

		console.log("🗑️ DELETE Goal Request:", {
			goalId: params.id,
			userId,
			userIdObjectId,
			userFirebaseUid: user.userId,
		});

		// Verify goal belongs to user (only owners can delete)
		// Check both possible userId formats
		const goal = await db.collection("goals").findOne({
			_id: new ObjectId(params.id),
			$or: [
				{ userId: userIdObjectId }, // MongoDB ObjectId
				{ userId: userId }, // String ID (Firebase UID)
				{ userId: user.userId }, // Original Firebase UID from auth
			],
		});

		console.log("🔍 Found goal:", {
			found: !!goal,
			goalUserId: goal?.userId,
			goalUserIdType: typeof goal?.userId,
		});

		if (!goal) {
			return NextResponse.json(
				{
					error: {
						message: "Goal not found or you don't have permission to delete",
						details: {
							searchedIds: {
								userIdObjectId,
								userId,
								userFirebaseUid: user.userId,
							},
						},
					},
				},
				{ status: 404 }
			);
		}

		// Try deleting with all possible userId formats
		const result = await db.collection("goals").deleteOne({
			_id: new ObjectId(params.id),
			$or: [
				{ userId: userIdObjectId },
				{ userId: userId },
				{ userId: user.userId },
			],
		});

		console.log("🗑️ Delete result:", {
			deletedCount: result.deletedCount,
			acknowledged: result.acknowledged,
		});

		if (result.deletedCount === 0) {
			return NextResponse.json(
				{
					error: {
						message: "Failed to delete goal",
					},
				},
				{ status: 500 }
			);
		}

		// Remove from collaborators' lists if it was collaborative
		if (goal.collaborators && goal.collaborators.length > 0) {
			// You might want to notify collaborators that the goal was deleted
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
		console.error("❌ Delete goal error:", error);

		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{ error: { message: "Unauthorized" } },
				{ status: 401 }
			);
		}

		// Handle invalid ObjectId
		if (error.message.includes("ObjectId") || error.message.includes("hex")) {
			return NextResponse.json(
				{ error: { message: "Invalid goal ID format" } },
				{ status: 400 }
			);
		}

		return NextResponse.json(
			{
				error: {
					message: "Server error",
					details:
						process.env.NODE_ENV === "development" ? error.message : undefined,
				},
			},
			{ status: 500 }
		);
	}
}
