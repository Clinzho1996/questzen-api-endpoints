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

// app/api/goals/[id]/route.ts - FIXED DELETE FUNCTION
export async function DELETE(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const user = await requireAuth(request);
		const params = await context.params;
		const db = await getDatabase();

		console.log("🗑️ DELETE Goal Request:", {
			goalId: params.id,
			userIdFromToken: user.userId,
			emailFromToken: user.email,
			provider: user.provider,
		});

		// Find user in database - try multiple ways
		const currentUser = await db.collection("users").findOne({
			$or: [
				{ _id: new ObjectId(user.userId) }, // Try as MongoDB ObjectId
				{ firebaseUid: user.userId }, // Try as Firebase UID
				{ email: user.email }, // Try by email
			],
		});

		if (!currentUser) {
			console.error("❌ User not found in database:", {
				searchedWith: {
					_id: user.userId,
					firebaseUid: user.userId,
					email: user.email,
				},
			});
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		console.log("👤 Found user in database:", {
			_id: currentUser._id,
			firebaseUid: currentUser.firebaseUid,
			email: currentUser.email,
		});

		// Get all possible user identifiers
		const userIdObjectId = currentUser._id;
		const userIdString = currentUser._id.toString();
		const firebaseUid = currentUser.firebaseUid;

		// Find the goal - check multiple possible userId formats
		const goal = await db.collection("goals").findOne({
			_id: new ObjectId(params.id),
			$or: [
				// MongoDB ObjectId format
				{ userId: userIdObjectId },
				// String version of ObjectId
				{ userId: userIdString },
				// Firebase UID if user has one
				...(firebaseUid ? [{ userId: firebaseUid }] : []),
			],
		});

		console.log("🔍 Goal query result:", {
			found: !!goal,
			goalId: goal?._id,
			goalUserId: goal?.userId,
			goalUserIdType: typeof goal?.userId,
			goalTitle: goal?.title,
		});

		if (!goal) {
			// Log what we searched for to debug
			const searchedIds = [
				userIdObjectId,
				userIdString,
				...(firebaseUid ? [firebaseUid] : []),
			];

			console.error("❌ Goal not found or no permission:", {
				searchedIds,
				actualGoalUserId: "Let's check the actual goal",
			});

			// Let's check what the goal actually has for userId
			const actualGoal = await db.collection("goals").findOne({
				_id: new ObjectId(params.id),
			});

			if (actualGoal) {
				console.error("❌ Goal exists but userId doesn't match:", {
					goalUserId: actualGoal.userId,
					goalUserIdType: typeof actualGoal.userId,
					goalTitle: actualGoal.title,
					userEmail: user.email,
				});
			}

			return NextResponse.json(
				{
					error: {
						message: "Goal not found or you don't have permission to delete",
						debug:
							process.env.NODE_ENV === "development"
								? {
										userIdsSearched: searchedIds,
										actualGoalUserId: actualGoal?.userId,
										userEmail: user.email,
								  }
								: undefined,
					},
				},
				{ status: 404 }
			);
		}

		// Delete the goal - try all possible userId formats
		const deleteQuery = {
			_id: new ObjectId(params.id),
			$or: [
				{ userId: userIdObjectId },
				{ userId: userIdString },
				...(firebaseUid ? [{ userId: firebaseUid }] : []),
			],
		};

		console.log("🗑️ Executing delete query:", deleteQuery);

		const result = await db.collection("goals").deleteOne(deleteQuery);

		console.log("🗑️ Delete result:", {
			deletedCount: result.deletedCount,
			acknowledged: result.acknowledged,
		});

		if (result.deletedCount === 0) {
			console.error("❌ Delete query matched but didn't delete");
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
			console.log(
				"👥 Removing goal from collaborators:",
				goal.collaborators.length
			);
			for (const collaborator of goal.collaborators) {
				await db.collection("notifications").insertOne({
					userId: collaborator.userId,
					type: "goal_deleted",
					title: "🗑️ Goal Deleted",
					message: `${goal.title} was deleted by the owner`,
					data: {
						goalId: params.id,
						goalTitle: goal.title,
						ownerId: userIdString,
					},
					read: false,
					createdAt: new Date(),
				});
			}
		}

		console.log("✅ Goal deleted successfully");

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
			console.error("❌ Invalid ObjectId:", error.message);
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
