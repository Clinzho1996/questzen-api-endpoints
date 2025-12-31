// app/api/habits/route.ts - UPDATED WITH COLLABORATIVE PROPERTIES
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

// GET all habits (both user's and predefined)
export async function GET(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		// Get current user
		let currentUser = null;

		// Lookup user logic
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
				console.log("Invalid ObjectId format");
			}
		}

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
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		// Get user's habits
		const userHabits = await db
			.collection("habits")
			.find({
				userId: currentUser._id,
				isPredefined: false,
			})
			.sort({ createdAt: -1 })
			.toArray();

		// Get predefined habits
		const predefinedHabits = await db
			.collection("habits")
			.find({
				isPredefined: true,
			})
			.toArray();

		// Check which predefined habits user has already added
		const userHabitNames = userHabits.map((h) => h.name);
		const availableHabits = predefinedHabits.filter(
			(habit) => !userHabitNames.includes(habit.name)
		);

		// Get today's date for completion check
		const today = new Date().toISOString().split("T")[0];

		// Get completions for all user habits
		const habitIds = userHabits.map((h) => h._id);
		let todayCompletions: any[] = [];

		if (habitIds.length > 0) {
			todayCompletions = await db
				.collection("habit_completions")
				.find({
					habitId: { $in: habitIds },
					date: today,
					userId: currentUser._id,
				})
				.toArray();
		}

		// Create a set of completed habit IDs for today
		const completedHabitIds = new Set(
			todayCompletions
				.filter((c) => c.completed)
				.map((c) => c.habitId.toString())
		);

		const transformedUserHabits = userHabits.map((habit) => {
			const isCompletedToday = completedHabitIds.has(habit._id.toString());

			// ADD DEBUG LOG
			console.log(`🔍 Habit DB values for ${habit.name}:`, {
				dbIsCollaborative: habit.isCollaborative,
				type: typeof habit.isCollaborative,
				dbCollaborators: habit.collaborators,
				dbParticipants: habit.participants,
				dbRole: habit.role,
			});

			const userRole = "owner";
			return {
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
				completedToday: isCompletedToday,
				progress: isCompletedToday ? 100 : 0,
				isActive: true,
				createdAt: habit.createdAt?.toISOString?.() || new Date().toISOString(),
				updatedAt: habit.updatedAt?.toISOString?.() || new Date().toISOString(),
				tags: habit.tags || [],
				isPredefined: false,
				isFromPredefined: habit.isFromPredefined || false,
				// FIX THESE LINES - Use the ACTUAL values from database
				isCollaborative: habit.isCollaborative, // NOT habit.isCollaborative === true
				role: userRole,
				collaborators: habit.collaborators || [],
				participants: habit.participants || [],
			};
		});
		// Transform available habits (predefined)
		const transformedAvailableHabits = availableHabits.map((habit) => ({
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
			defaultSettings: habit.defaultSettings || {
				timesPerWeek: 7,
				timeOfDay: ["any"],
				reminders: [],
				duration: 5,
			},
			isPredefined: true,
		}));

		const response = {
			userHabits: transformedUserHabits,
			availableHabits: transformedAvailableHabits,
		};

		console.log(
			`✅ Returned ${transformedUserHabits.length} user habits with collaborative properties`
		);

		return NextResponse.json(response);
	} catch (error: any) {
		console.error("Get habits error:", error);
		return NextResponse.json(
			{ error: { message: "Failed to fetch habits" } },
			{ status: 500 }
		);
	}
}

// POST - Add a new habit (either custom or from predefined) - UPDATED WITH COLLABORATIVE PROPERTIES
export async function POST(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const body = await request.json();
		const {
			name,
			description,
			category,
			timeOfDay = [],
			timesPerWeek = 7,
			timesPerDay = 1,
			reminders = [],
			duration,
			isPredefined = false,
			predefinedHabitId,
			settings = {},
			info = {},
			// ADD THESE OPTIONAL COLLABORATIVE PROPERTIES:
			isCollaborative = false,
			role = "owner",
			collaborators = [],
			participants = [],
		} = body;

		const db = await getDatabase();

		// Get current user - COMPLETE USER LOOKUP LOGIC
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

		// Create new user if not found
		if (!currentUser) {
			console.log("🔄 Creating new user for habit creation...");
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

		// Log user information
		console.log("👤 Current user for habit creation:", {
			userId: currentUser._id,
			firebaseUid: currentUser.firebaseUid,
			email: currentUser.email,
		});

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
				_id: undefined, // Will be set by MongoDB
				userId: currentUser._id,
				userFirebaseUid: currentUser.firebaseUid || undefined,
				isPredefined: false,
				isFromPredefined: true,
				originalHabitId: predefinedHabitId,
				settings: {
					...predefinedHabit.defaultSettings,
					...settings,
					timeOfDay:
						timeOfDay.length > 0
							? timeOfDay
							: predefinedHabit.defaultSettings?.timeOfDay || [],
					timesPerWeek:
						timesPerWeek || predefinedHabit.defaultSettings?.timesPerWeek || 7,
					timesPerDay:
						timesPerDay || predefinedHabit.defaultSettings?.timesPerDay || 1,
					reminders:
						reminders.length > 0
							? reminders
							: predefinedHabit.defaultSettings?.reminders || [],
					duration: duration || predefinedHabit.defaultSettings?.duration || 5,
				},
				stats: {
					totalCompletions: 0,
					bestStreak: 0,
					currentStreak: 0,
					averageCompletionTime: 0,
					successRate: 0,
					totalMinutesSpent: 0,
					completionHistory: [],
				},
				// ADD COLLABORATIVE PROPERTIES:
				isCollaborative: isCollaborative,
				role: role,
				collaborators: collaborators,
				participants: participants,
				createdAt: new Date(),
				updatedAt: new Date(),
			};
		} else {
			// Custom habit
			habitData = {
				userId: currentUser._id,
				userFirebaseUid: currentUser.firebaseUid || undefined,
				name,
				description: description || "",
				category: category || "custom",
				isPredefined: false,
				isFromPredefined: false,
				settings: {
					timeOfDay,
					timesPerWeek,
					timesPerDay,
					reminders,
					duration,
				},
				info: info || {},
				stats: {
					totalCompletions: 0,
					bestStreak: 0,
					currentStreak: 0,
					averageCompletionTime: 0,
					successRate: 0,
					totalMinutesSpent: 0,
					completionHistory: [],
				},
				tags: [],
				color: "#3B82F6",
				icon: "✅",
				// ADD COLLABORATIVE PROPERTIES:
				isCollaborative: isCollaborative,
				role: role,
				collaborators: collaborators,
				participants: participants,
				createdAt: new Date(),
				updatedAt: new Date(),
			};
		}

		console.log("📝 Creating habit with data:", {
			userId: habitData.userId,
			isCollaborative: habitData.isCollaborative,
			role: habitData.role,
			collaborators: habitData.collaborators?.length || 0,
		});

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
				userFirebaseUid: currentUser.firebaseUid || undefined,
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

		if (weeklyCompletions.length > 0) {
			await db.collection("habit_completions").insertMany(weeklyCompletions);
			console.log(`✅ Created ${weeklyCompletions.length} completion records`);
		}

		const newHabit = await db.collection("habits").findOne({ _id: habitId });

		if (!newHabit) {
			throw new Error("Failed to retrieve created habit");
		}

		return NextResponse.json(
			{
				id: newHabit._id.toString(),
				...newHabit,
				_id: undefined,
			},
			{ status: 201 }
		);
	} catch (error: any) {
		console.error("Create habit error:", error);
		return NextResponse.json(
			{ error: { message: "Failed to create habit", details: error.message } },
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
