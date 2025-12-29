// app/api/goals/[id]/route.ts - COMPLETE INTERFACES
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

// ==================== TYPE DEFINITIONS ====================

interface UserDocument {
	_id: ObjectId;
	firebaseUid?: string;
	email: string;
	displayName?: string;
	photoURL?: string;
	subscriptionTier?: "free" | "premium" | "pro";
	streak?: number;
	longestStreak?: number;
	totalFocusMinutes?: number;
	level?: number;
	xp?: number;
	completedGoals?: number;
	focusSessions?: number;
	achievements?: string[];
	stripeCustomerId?: string;
	stripeSubscriptionId?: string;
	subscriptionStatus?: "active" | "canceled" | "past_due" | "incomplete";
	currentPeriodEnd?: Date;
	password?: string; // Only for custom JWT users
	createdAt?: Date;
	updatedAt?: Date;
	// Additional fields for goals/quests
	isOnboarded?: boolean;
	timezone?: string;
	dailyGoalTarget?: number;
	weeklyGoalTarget?: number;
	monthlyGoalTarget?: number;
	notificationsEnabled?: boolean;
	emailNotifications?: boolean;
	pushNotifications?: boolean;
	theme?: "light" | "dark" | "system";
	language?: string;
	lastLogin?: Date;
	totalGoalsCreated?: number;
	totalGoalsCompleted?: number;
}

interface Collaborator {
	userId: string; // Can be ObjectId string or Firebase UID
	email: string;
	name?: string;
	avatar?: string;
	role?: "editor" | "viewer";
	invitedAt: Date;
	joinedAt?: Date;
	status?: "pending" | "accepted" | "declined";
}

interface Task {
	id: string;
	title: string;
	completed: boolean;
	createdAt: Date;
	completedAt?: Date;
	order?: number;
}

interface GoalDocument {
	// ID can be ObjectId (for MongoDB) or string (for migrated Firebase goals)
	_id: ObjectId | string;

	// Owner identification
	userId?: ObjectId | string; // Can be ObjectId or string (for Firebase UID)
	userFirebaseUid?: string; // Alternative field for Firebase users

	// Goal details
	title: string;
	description?: string;
	category?: "Work" | "Study" | "Personal" | "Health" | "Others" | string;
	priority?: "High" | "Medium" | "Low" | string;
	completed: boolean;
	progress: number; // 0-100

	// Dates
	dueDate?: string; // ISO string date only (YYYY-MM-DD)
	dueTime?: string; // Time only (HH:MM)
	deadline?: Date; // Combined date-time for sorting/filtering
	createdAt: Date;
	updatedAt?: Date;
	completedAt?: Date;

	// Collaboration
	isCollaborative?: boolean;
	collaborators?: Collaborator[];
	accessibleTo?: string[]; // Array of user IDs who can access this goal
	participants?: Array<{
		id: string;
		name: string;
		avatar: string;
		role: "owner" | "collaborator";
	}>;
	sharedWith?: number;

	// Tasks/subtasks
	tasks?: Task[];

	// Additional metadata
	firebaseId?: string; // Original Firebase ID for migrated goals
	tags?: string[];
	color?: string;
	icon?: string;
	reminders?: Array<{
		id: string;
		time: string; // ISO time
		enabled: boolean;
	}>;

	// Statistics
	timeSpent?: number; // in minutes
	checkIns?: number;
	lastCheckIn?: Date;

	// Recurrence
	isRecurring?: boolean;
	recurrenceRule?: string; // e.g., "daily", "weekly", "monthly"
	parentGoalId?: ObjectId | string; // For recurring goals
	nextOccurrence?: Date;

	// Privacy
	isPrivate?: boolean;
	visibility?: "private" | "shared" | "public";
}

// ==================== PATCH FUNCTION ====================

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

		// Get current user info
		const usersCollection = db.collection<UserDocument>("users");
		const currentUser = await usersCollection.findOne({
			$or: [
				{ _id: new ObjectId(user.userId) },
				{ firebaseUid: user.userId },
				{ email: user.email },
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

		const userIdObjectId = currentUser._id;
		const userIdString = currentUser._id.toString();
		const firebaseUid = currentUser.firebaseUid;

		// Check if the goal ID is a MongoDB ObjectId or Firebase ID
		const isMongoDBId = /^[0-9a-fA-F]{24}$/.test(params.id);

		const goalsCollection = db.collection<GoalDocument>("goals");
		let goal: GoalDocument | null = null;

		if (isMongoDBId) {
			// MongoDB goal - search in MongoDB
			console.log("🔍 Searching for MongoDB goal:", params.id);

			goal = await goalsCollection.findOne({
				_id: new ObjectId(params.id) as any,
				$or: [
					{ userId: userIdObjectId },
					{ userId: userIdString },
					...(firebaseUid ? [{ userId: firebaseUid }] : []),
					{ userFirebaseUid: firebaseUid },
					{ "collaborators.userId": userIdObjectId.toString() },
					{ "collaborators.userId": userIdString },
					...(firebaseUid ? [{ "collaborators.userId": firebaseUid }] : []),
				],
			} as any);
		} else {
			// Firebase goal - search with string ID
			console.log("🔥 Searching for Firebase goal:", params.id);

			// Try multiple search methods
			const searchConditions = [
				// Try as string _id
				{ _id: params.id as any },
				// Try as firebaseId field
				{ firebaseId: params.id },
				// Try as string in userId field
				{ userId: params.id },
			];

			for (const condition of searchConditions) {
				if (!goal) {
					goal = await goalsCollection.findOne({
						...condition,
						$or: [
							{ userId: userIdObjectId },
							{ userId: userIdString },
							...(firebaseUid ? [{ userId: firebaseUid }] : []),
							{ userFirebaseUid: firebaseUid },
							{ "collaborators.userId": userIdObjectId.toString() },
							{ "collaborators.userId": userIdString },
							...(firebaseUid ? [{ "collaborators.userId": firebaseUid }] : []),
						],
					} as any);
				}
			}
		}

		if (!goal) {
			console.error("❌ Goal not found or no access:", {
				goalId: params.id,
				isMongoDBId,
			});
			return NextResponse.json(
				{ error: { message: "Goal not found or no access" } },
				{ status: 404 }
			);
		}

		// Check if user is owner
		const isOwner =
			(goal.userId &&
				(goal.userId.toString() === userIdObjectId.toString() ||
					goal.userId === userIdString ||
					(firebaseUid && goal.userId === firebaseUid))) ||
			(goal.userFirebaseUid && goal.userFirebaseUid === firebaseUid);

		console.log("🔍 User role check:", {
			isOwner,
			goalUserId: goal.userId,
			goalUserFirebaseUid: goal.userFirebaseUid,
			userIdentifiers: {
				userIdObjectId: userIdObjectId?.toString(),
				userIdString,
				firebaseUid,
			},
		});

		// Build update object
		const updateData: Partial<GoalDocument> = {
			updatedAt: new Date(),
		};

		// Track if this is a completion toggle
		const isCompleting =
			body.completed !== undefined && body.completed && !goal.completed;
		const isReopening =
			body.completed !== undefined && !body.completed && goal.completed;

		// Handle completion status
		if (body.completed !== undefined) {
			updateData.completed = body.completed;
			if (body.completed) {
				updateData.completedAt = new Date();
			} else {
				updateData.completedAt = undefined;
			}
		}

		// Handle progress
		if (body.progress !== undefined) {
			updateData.progress = body.progress;
		}

		// Handle due date and time
		if (body.dueDate !== undefined) updateData.dueDate = body.dueDate;
		if (body.dueTime !== undefined) updateData.dueTime = body.dueTime;

		// Update deadline if date/time changes
		if (body.dueDate !== undefined || body.dueTime !== undefined) {
			const newDueDate =
				body.dueDate !== undefined ? body.dueDate : goal.dueDate;
			const newDueTime =
				body.dueTime !== undefined ? body.dueTime : goal.dueTime;

			if (newDueDate && newDueTime) {
				try {
					updateData.deadline = new Date(`${newDueDate}T${newDueTime}`);
				} catch (error) {
					console.error("Error parsing deadline:", error);
				}
			} else if (newDueDate) {
				updateData.deadline = new Date(newDueDate);
			} else {
				updateData.deadline = undefined;
			}
		}

		// Owners can update additional fields
		if (isOwner) {
			if (body.title !== undefined) updateData.title = body.title;
			if (body.description !== undefined)
				updateData.description = body.description;
			if (body.category !== undefined) updateData.category = body.category;
			if (body.priority !== undefined) updateData.priority = body.priority;
			if (body.tasks !== undefined) updateData.tasks = body.tasks;
			if (body.isCollaborative !== undefined)
				updateData.isCollaborative = body.isCollaborative;
			if (body.collaborators !== undefined)
				updateData.collaborators = body.collaborators;
			if (body.tags !== undefined) updateData.tags = body.tags;
			if (body.color !== undefined) updateData.color = body.color;
		}

		// Perform the update based on goal type
		let updateResult;
		if (isMongoDBId) {
			// Update MongoDB goal
			updateResult = await goalsCollection.updateOne(
				{ _id: new ObjectId(params.id) as any },
				{ $set: updateData }
			);
		} else {
			// Update Firebase goal (stored in MongoDB with string ID)
			updateResult = await goalsCollection.updateOne(
				{ _id: params.id as any },
				{ $set: updateData }
			);
		}

		console.log("✅ Goal update result:", {
			matchedCount: updateResult.matchedCount,
			modifiedCount: updateResult.modifiedCount,
			isMongoDBId,
		});

		// If this is a completion toggle, also update user stats (only for MongoDB goals)
		if ((isCompleting || isReopening) && isMongoDBId) {
			console.log("📊 Updating user stats for goal completion change:", {
				userId: userIdString,
				isCompleting,
				isReopening,
				goalId: params.id,
			});

			// Update user's completedGoals count and XP
			const xpChange = isCompleting ? 50 : -50;
			const completedChange = isCompleting ? 1 : -1;

			await usersCollection.updateOne(
				{ _id: userIdObjectId },
				{
					$inc: {
						xp: xpChange,
						completedGoals: completedChange,
						...(isCompleting && { totalGoalsCompleted: 1 }),
						...(isReopening && { totalGoalsCompleted: -1 }),
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
				const updatedUser = await usersCollection.findOne(
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

					// Check for first quest achievement
					if (completedCount >= 1 && !achievements.includes("first_quest")) {
						console.log("🎉 Unlocking 'first_quest' achievement");

						await usersCollection.updateOne({ _id: userIdObjectId }, {
							$addToSet: { achievements: "first_quest" } as any,
							$inc: { xp: 100 },
						} as any);
						console.log("✅ 'first_quest' achievement unlocked");
					}

					// Check for quest master achievement
					if (completedCount >= 10 && !achievements.includes("quest_master")) {
						console.log("🎉 Unlocking 'quest_master' achievement");

						await usersCollection.updateOne({ _id: userIdObjectId }, {
							$addToSet: { achievements: "quest_master" } as any,
							$inc: { xp: 100 },
						} as any);
						console.log("✅ 'quest_master' achievement unlocked");
					}
				}
			}
		}

		// Get updated goal
		let updatedGoal;
		if (isMongoDBId) {
			updatedGoal = await goalsCollection.findOne({
				_id: new ObjectId(params.id) as any,
			});
		} else {
			updatedGoal = await goalsCollection.findOne({ _id: params.id as any });
		}

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
			completedAt: updatedGoal.completedAt?.toISOString?.(),
			// Include calculated fields for frontend
			isOwner,
			isCollaborative: updatedGoal.isCollaborative || false,
			participants: updatedGoal.participants || [],
			collaborators: updatedGoal.collaborators || [],
		};

		console.log("✅ Goal updated successfully:", {
			id: responseGoal.id,
			role: responseGoal.role,
			completed: responseGoal.completed,
			isMongoDBGoal: isMongoDBId,
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

		// Handle invalid ObjectId for MongoDB IDs
		if (error.message.includes("ObjectId") || error.message.includes("hex")) {
			console.error("❌ Invalid MongoDB ObjectId:", error.message);
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

// ==================== DELETE FUNCTION ====================

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
		});

		const usersCollection = db.collection<UserDocument>("users");
		const currentUser = await usersCollection.findOne({
			$or: [
				{ _id: new ObjectId(user.userId) },
				{ firebaseUid: user.userId },
				{ email: user.email },
			],
		});

		if (!currentUser) {
			console.error("❌ User not found in database");
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		const userIdObjectId = currentUser._id;
		const userIdString = currentUser._id.toString();
		const firebaseUid = currentUser.firebaseUid;

		// Check if goal ID is MongoDB or Firebase
		const isMongoDBId = /^[0-9a-fA-F]{24}$/.test(params.id);
		const goalsCollection = db.collection<GoalDocument>("goals");

		let deleteQuery;
		if (isMongoDBId) {
			// MongoDB goal
			deleteQuery = {
				_id: new ObjectId(params.id) as any,
				$or: [
					{ userId: userIdObjectId },
					{ userId: userIdString },
					...(firebaseUid ? [{ userId: firebaseUid }] : []),
					{ userFirebaseUid: firebaseUid },
				],
			};
		} else {
			// Firebase goal
			deleteQuery = {
				_id: params.id as any,
				$or: [
					{ userId: userIdObjectId },
					{ userId: userIdString },
					...(firebaseUid ? [{ userId: firebaseUid }] : []),
					{ userFirebaseUid: firebaseUid },
				],
			};
		}

		console.log("🗑️ Executing delete query:", deleteQuery);

		const result = await goalsCollection.deleteOne(deleteQuery as any);

		console.log("🗑️ Delete result:", {
			deletedCount: result.deletedCount,
			acknowledged: result.acknowledged,
			isMongoDBId,
		});

		if (result.deletedCount === 0) {
			console.error("❌ Delete query matched but didn't delete");
			return NextResponse.json(
				{
					error: { message: "Failed to delete goal or no permission" },
				},
				{ status: 500 }
			);
		}

		return NextResponse.json({
			message: "Goal deleted successfully",
		});
	} catch (error: any) {
		console.error("❌ Delete goal error:", error);
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
