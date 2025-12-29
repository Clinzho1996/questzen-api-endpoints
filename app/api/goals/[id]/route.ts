// app/api/goals/[id]/route.ts - FIXED ACHIEVEMENT UNLOCKING
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
			email: user.email,
			updates: body,
		});

		// Get current user info - TRY MULTIPLE WAYS
		const currentUser = await db.collection("users").findOne({
			$or: [
				{ _id: new ObjectId(user.userId) }, // Try as MongoDB ObjectId
				{ firebaseUid: user.userId }, // Try as Firebase UID
				{ email: user.email }, // Try by email
			],
		});

		if (!currentUser) {
			console.error("❌ User not found in database:", {
				userId: user.userId,
				email: user.email,
			});
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		console.log("👤 Found user:", {
			_id: currentUser._id,
			firebaseUid: currentUser.firebaseUid,
			email: currentUser.email,
		});

		// Get all possible user identifiers
		const userIdObjectId = currentUser._id;
		const userIdString = currentUser._id.toString();
		const firebaseUid = currentUser.firebaseUid;

		// Verify goal belongs to user OR user is a collaborator
		const goal = await db.collection("goals").findOne({
			_id: new ObjectId(params.id),
			$or: [
				// Check as MongoDB ObjectId
				{ userId: userIdObjectId },
				// Check as string version of ObjectId
				{ userId: userIdString },
				// Check as Firebase UID if user has one
				...(firebaseUid ? [{ userId: firebaseUid }] : []),
				// Check as collaborator with ObjectId
				{ "collaborators.userId": userIdObjectId.toString() },
				// Check as collaborator with string
				{ "collaborators.userId": userIdString },
				// Check as collaborator with Firebase UID
				...(firebaseUid ? [{ "collaborators.userId": firebaseUid }] : []),
			],
		});

		if (!goal) {
			// Log what we searched for to debug
			const searchedIds = [
				userIdObjectId,
				userIdString,
				...(firebaseUid ? [firebaseUid] : []),
			];

			console.error("❌ Goal not found or no access:", {
				searchedIds,
				goalId: params.id,
			});

			return NextResponse.json(
				{ error: { message: "Goal not found or no access" } },
				{ status: 404 }
			);
		}

		// Check if user is owner
		const isOwner =
			goal.userId?.toString() === userIdObjectId?.toString() ||
			goal.userId === userIdString ||
			(firebaseUid && goal.userId === firebaseUid);

		console.log("🔍 User role check:", {
			isOwner,
			goalUserId: goal.userId,
			userIdentifiers: {
				userIdObjectId: userIdObjectId?.toString(),
				userIdString,
				firebaseUid,
			},
		});

		// Track if this is a completion toggle for stats update
		const isCompleting =
			body.completed !== undefined && body.completed && !goal.completed;
		const isReopening =
			body.completed !== undefined && !body.completed && goal.completed;

		// Build update object
		const updateData: any = {
			updatedAt: new Date(),
		};

		// Handle completion status
		if (body.completed !== undefined) {
			updateData.completed = body.completed;
			if (body.completed) {
				updateData.completedAt = new Date();
			} else {
				updateData.completedAt = null;
			}
		}

		// Handle progress updates - ALLOW BOTH OWNERS AND COLLABORATORS
		if (body.progress !== undefined) {
			updateData.progress = body.progress;
		}

		// Owners can update additional fields
		if (isOwner) {
			if (body.title !== undefined) updateData.title = body.title;
			if (body.description !== undefined)
				updateData.description = body.description;
			if (body.category !== undefined) updateData.category = body.category;
			if (body.priority !== undefined) updateData.priority = body.priority;
			if (body.tasks !== undefined) updateData.tasks = body.tasks;
		}

		console.log("📝 Applying updates:", updateData);

		// Perform the update
		await db
			.collection("goals")
			.updateOne({ _id: new ObjectId(params.id) }, { $set: updateData });

		// If this is a completion toggle, also update user stats
		if (isCompleting || isReopening) {
			console.log("📊 Updating user stats for goal completion change:", {
				userId: userIdString,
				isCompleting,
				isReopening,
				goalId: params.id,
			});

			// Update user's completedGoals count and XP
			const xpChange = isCompleting ? 50 : -50;
			const completedChange = isCompleting ? 1 : -1;

			await db.collection("users").updateOne(
				{ _id: userIdObjectId },
				{
					$inc: {
						xp: xpChange,
						completedGoals: completedChange,
					},
					$set: {
						updatedAt: new Date(),
					},
				}
			);

			console.log("✅ User stats updated:", {
				xpChange,
				completedChange,
			});

			// Check for achievements if completing a goal
			if (isCompleting) {
				// Get updated user to check achievements
				const updatedUser = await db
					.collection("users")
					.findOne(
						{ _id: userIdObjectId },
						{ projection: { completedGoals: 1, achievements: 1 } }
					);

				if (updatedUser) {
					const completedCount = updatedUser.completedGoals || 0;
					const achievements = updatedUser.achievements || [];

					console.log("🏆 Checking achievements:", {
						completedCount,
						currentAchievements: achievements,
					});

					// FIXED: Use the correct MongoDB update syntax
					// Check for first quest achievement
					if (completedCount >= 1 && !achievements.includes("first_quest")) {
						console.log("🎉 Unlocking 'first_quest' achievement");

						// Method 1: Use $addToSet (prevents duplicates)
						await db.collection("users").updateOne(
							{ _id: userIdObjectId },
							{
								$addToSet: { achievements: "first_quest" },
								$inc: { xp: 100 },
							} as any // Type assertion to bypass TypeScript error
						);
						console.log("✅ 'first_quest' achievement unlocked");
					}

					// Check for quest master achievement
					if (completedCount >= 10 && !achievements.includes("quest_master")) {
						console.log("🎉 Unlocking 'quest_master' achievement");

						// Method 2: Use $push with proper typing
						const updateDoc: any = {
							$push: { achievements: "quest_master" },
							$inc: { xp: 100 },
						};
						await db
							.collection("users")
							.updateOne({ _id: userIdObjectId }, updateDoc);
						console.log("✅ 'quest_master' achievement unlocked");
					}
				}
			}
		}

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
			dueDate: updatedGoal.dueDate,
			dueTime: updatedGoal.dueTime,
			deadline: updatedGoal.deadline?.toISOString?.(),
			createdAt: updatedGoal.createdAt?.toISOString?.(),
			updatedAt: updatedGoal.updatedAt?.toISOString?.(),
		};

		console.log("✅ Goal updated successfully:", {
			id: responseGoal.id,
			role: responseGoal.role,
			isCompleting,
			isReopening,
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
