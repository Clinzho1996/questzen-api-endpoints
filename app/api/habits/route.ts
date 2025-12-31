// app/api/habits/route.ts
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
				currentUser = await db
					.collection("users")
					.findOne(
						{ _id: new ObjectId(user.userId) },
						{ projection: { _id: 1, firebaseUid: 1, email: 1 } }
					);
			} catch (error) {
				console.log("Invalid ObjectId format");
			}
		}

		if (!currentUser && user.userId) {
			currentUser = await db
				.collection("users")
				.findOne(
					{ firebaseUid: user.userId },
					{ projection: { _id: 1, firebaseUid: 1, email: 1 } }
				);
		}

		if (!currentUser && user.email) {
			currentUser = await db
				.collection("users")
				.findOne(
					{ email: user.email.toLowerCase().trim() },
					{ projection: { _id: 1, firebaseUid: 1, email: 1 } }
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

		const response = {
			userHabits: userHabits.map((habit) => ({
				...habit,
				id: habit._id.toString(),
				_id: undefined,
			})),
			availableHabits: availableHabits.map((habit) => ({
				...habit,
				id: habit._id.toString(),
				_id: undefined,
			})),
		};

		return NextResponse.json(response);
	} catch (error: any) {
		console.error("Get habits error:", error);
		return NextResponse.json(
			{ error: { message: "Failed to fetch habits" } },
			{ status: 500 }
		);
	}
}

// POST - Add a new habit (either custom or from predefined)
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
				createdAt: new Date(),
				updatedAt: new Date(),
			};
		}

		console.log("📝 Creating habit with data:", {
			userId: habitData.userId,
			userFirebaseUid: habitData.userFirebaseUid,
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
