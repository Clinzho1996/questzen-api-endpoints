// scripts/seed-habits.ts
import { getDatabase } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

const HABITS = [
	// ==================== MORNING ROUTINE ====================
	{
		name: "Morning Gratitude",
		description: "Start your day by acknowledging things you're thankful for",
		category: "morning_routine",
		timeCommitment: 5,
		frequency: "daily",
		benefits: ["happiness", "mindfulness", "positivity", "stress_reduction"],
		icon: "🙏",
		color: "#F59E0B",
		tags: ["mindfulness", "positive psychology", "mental health"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["morning"],
			reminders: ["07:00"],
			duration: 5,
			timesPerDay: 1,
		},
		info: {
			description:
				"Taking a moment each morning to acknowledge things you're grateful for sets a positive tone for the day.",
			howTo:
				"1. Find a quiet spot\n2. List 3 things you're grateful for\n3. Reflect on why each matters\n4. Feel the gratitude\n5. Carry that feeling into your day",
			benefits:
				"Boosts mood, reduces stress, improves sleep, strengthens relationships, increases resilience",
			whyItWorks:
				"Gratitude rewires your brain to focus on positive aspects, creating a happiness loop.",
			sideEffects: "May cause increased happiness and improved relationships",
			tips: "Be specific, write it down, involve all senses, make it a ritual",
			supportingArticles: [
				"https://www.health.harvard.edu/healthbeat/giving-thanks-can-make-you-happier",
			],
		},
	},
	{
		name: "Positive Self-Talk",
		description: "Start your day with positive affirmations",
		category: "morning_routine",
		timeCommitment: 3,
		frequency: "daily",
		benefits: ["confidence", "self_esteem", "positivity", "mental_health"],
		icon: "💭",
		color: "#8B5CF6",
		tags: ["mindset", "confidence", "self_improvement"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["morning"],
			reminders: ["07:15"],
			duration: 3,
			timesPerDay: 1,
		},
		info: {
			description:
				"Positive self-talk builds confidence and sets a constructive mindset for the day.",
			howTo:
				"1. Stand in front of a mirror\n2. Say 3 positive affirmations about yourself\n3. Visualize success\n4. Feel the confidence growing",
			benefits:
				"Increases confidence, reduces anxiety, improves performance, enhances self-esteem",
			whyItWorks:
				"Affirmations activate the brain's reward system and help overcome negative thought patterns.",
			sideEffects: "Improved self-image and reduced self-doubt",
			tips: "Be specific, use present tense, believe what you say",
			supportingArticles: [
				"https://www.psychologytoday.com/us/blog/click-here-happiness/202003/the-power-positive-self-talk",
			],
		},
	},
	{
		name: "Take Vitamin B12",
		description:
			"Daily vitamin B12 supplementation for energy and brain function",
		category: "morning_routine",
		timeCommitment: 1,
		frequency: "daily",
		benefits: ["energy", "brain_health", "mood", "antiaging"],
		icon: "💊",
		color: "#10B981",
		tags: ["health", "nutrition", "supplements"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["morning"],
			reminders: ["08:00"],
			duration: 1,
			timesPerDay: 1,
		},
		info: {
			description:
				"Vitamin B12 is essential for energy production, brain function, and nervous system health.",
			howTo:
				"1. Take with breakfast\n2. Follow recommended dosage\n3. Consider sublingual for better absorption\n4. Pair with other B vitamins",
			benefits:
				"Boosts energy, improves memory, supports nerve health, prevents anemia",
			whyItWorks:
				"B12 is crucial for red blood cell formation and neurological function.",
			sideEffects: "Rare at recommended doses",
			tips: "Take with food, get levels checked annually",
			supportingArticles: [
				"https://www.health.harvard.edu/staying-healthy/vitamin-b12-deficiency-can-be-sneaky-harmful",
			],
		},
	},
	{
		name: "Morning Yoga",
		description: "Gentle stretching and yoga to wake up the body",
		category: "morning_routine",
		timeCommitment: 15,
		frequency: "daily",
		benefits: ["flexibility", "mindfulness", "energy", "stress_reduction"],
		icon: "🧘",
		color: "#3B82F6",
		tags: ["fitness", "mindfulness", "flexibility"],
		difficulty: "medium",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["morning"],
			reminders: ["06:30"],
			duration: 15,
			timesPerDay: 1,
		},
	},
	{
		name: "Morning Journaling",
		description: "Write down thoughts, goals, and plans for the day",
		category: "morning_routine",
		timeCommitment: 10,
		frequency: "daily",
		benefits: ["clarity", "productivity", "mental_health", "focus"],
		icon: "📔",
		color: "#EF4444",
		tags: ["writing", "planning", "mindfulness"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["morning"],
			reminders: ["07:30"],
			duration: 10,
			timesPerDay: 1,
		},
	},
	{
		name: "Mind Movies",
		description: "Visualization exercise for goal achievement",
		category: "morning_routine",
		timeCommitment: 5,
		frequency: "daily",
		benefits: ["focus", "motivation", "confidence", "goal_achievement"],
		icon: "🎬",
		color: "#EC4899",
		tags: ["visualization", "goals", "mindset"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["morning"],
			reminders: ["07:20"],
			duration: 5,
			timesPerDay: 1,
		},
	},

	// ==================== AFTERNOON ROUTINE ====================
	{
		name: "Hydration Check",
		description: "Drink a glass of water to stay hydrated",
		category: "afternoon_routine",
		timeCommitment: 2,
		frequency: "daily",
		benefits: ["health", "energy", "clarity", "skin_health"],
		icon: "💧",
		color: "#0EA5E9",
		tags: ["health", "hydration", "wellness"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["afternoon"],
			reminders: ["14:00"],
			duration: 2,
			timesPerDay: 1,
		},
	},
	{
		name: "Afternoon Stretch",
		description: "Quick stretching to prevent stiffness and boost energy",
		category: "afternoon_routine",
		timeCommitment: 5,
		frequency: "daily",
		benefits: ["flexibility", "energy", "posture", "stress_reduction"],
		icon: "🤸",
		color: "#10B981",
		tags: ["fitness", "flexibility", "energy"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["afternoon"],
			reminders: ["15:00"],
			duration: 5,
			timesPerDay: 1,
		},
	},

	// ==================== EVENING ROUTINE ====================
	{
		name: "Evening Reflection",
		description: "Reflect on your day and lessons learned",
		category: "evening_routine",
		timeCommitment: 10,
		frequency: "daily",
		benefits: ["self_awareness", "learning", "mindfulness", "growth"],
		icon: "🤔",
		color: "#6366F1",
		tags: ["reflection", "learning", "mindfulness"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["evening"],
			reminders: ["21:00"],
			duration: 10,
			timesPerDay: 1,
		},
	},
	{
		name: "Plan Next Day",
		description: "Plan and prioritize tasks for tomorrow",
		category: "evening_routine",
		timeCommitment: 10,
		frequency: "daily",
		benefits: ["productivity", "organization", "stress_reduction", "focus"],
		icon: "📋",
		color: "#8B5CF6",
		tags: ["planning", "productivity", "organization"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["evening"],
			reminders: ["20:30"],
			duration: 10,
			timesPerDay: 1,
		},
	},
	{
		name: "Sleep 6-8 Hours",
		description: "Get adequate quality sleep for optimal health",
		category: "evening_routine",
		timeCommitment: 480,
		frequency: "daily",
		benefits: ["health", "energy", "brain_health", "antiaging", "mood"],
		icon: "😴",
		color: "#1E40AF",
		tags: ["health", "sleep", "recovery"],
		difficulty: "medium",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["evening"],
			reminders: ["22:00"],
			duration: 480,
			timesPerDay: 1,
		},
	},

	// ==================== ANY TIME HABITS ====================
	{
		name: "Exercise",
		description: "Physical activity for at least 30 minutes",
		category: "any_time",
		timeCommitment: 30,
		frequency: "daily",
		benefits: ["health", "energy", "mood", "antiaging", "weight_management"],
		icon: "💪",
		color: "#DC2626",
		tags: ["fitness", "health", "exercise"],
		difficulty: "medium",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 5,
			timeOfDay: ["any"],
			reminders: ["18:00"],
			duration: 30,
			timesPerDay: 1,
		},
	},
	{
		name: "Get Outside",
		description: "Spend time outdoors in nature",
		category: "any_time",
		timeCommitment: 15,
		frequency: "daily",
		benefits: ["mental_health", "vitamin_d", "mood", "stress_reduction"],
		icon: "🌳",
		color: "#059669",
		tags: ["nature", "mental_health", "wellness"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["any"],
			reminders: ["12:00"],
			duration: 15,
			timesPerDay: 1,
		},
	},
	{
		name: "Socialize",
		description: "Connect with friends, family, or colleagues",
		category: "any_time",
		timeCommitment: 30,
		frequency: "daily",
		benefits: [
			"happiness",
			"mental_health",
			"relationships",
			"stress_reduction",
		],
		icon: "👥",
		color: "#7C3AED",
		tags: ["social", "relationships", "mental_health"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["any"],
			reminders: ["19:00"],
			duration: 30,
			timesPerDay: 1,
		},
	},
	{
		name: "Breathing Exercises",
		description: "Deep breathing for relaxation and focus",
		category: "any_time",
		timeCommitment: 5,
		frequency: "daily",
		benefits: ["stress_reduction", "focus", "calmness", "mental_clarity"],
		icon: "🌬️",
		color: "#06B6D4",
		tags: ["mindfulness", "relaxation", "stress_management"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["any"],
			reminders: ["10:00", "15:00", "20:00"],
			duration: 5,
			timesPerDay: 3,
		},
	},
	{
		name: "Meditation",
		description: "Mindfulness meditation practice",
		category: "any_time",
		timeCommitment: 10,
		frequency: "daily",
		benefits: ["mindfulness", "stress_reduction", "focus", "mental_clarity"],
		icon: "🧘‍♂️",
		color: "#6366F1",
		tags: ["mindfulness", "meditation", "mental_health"],
		difficulty: "medium",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["any"],
			reminders: ["08:00"],
			duration: 10,
			timesPerDay: 1,
		},
	},
	{
		name: "Alcohol-Free Day",
		description: "A day without alcohol consumption",
		category: "any_time",
		timeCommitment: 0,
		frequency: "weekly",
		benefits: ["health", "sleep", "energy", "liver_health"],
		icon: "🚫",
		color: "#6B7280",
		tags: ["health", "sobriety", "wellness"],
		difficulty: "medium",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 1,
			timeOfDay: ["any"],
			reminders: [],
			duration: 0,
			timesPerDay: 1,
		},
	},
	{
		name: "Call a Friend",
		description: "Reach out to a friend or family member",
		category: "any_time",
		timeCommitment: 15,
		frequency: "weekly",
		benefits: ["relationships", "happiness", "mental_health", "connection"],
		icon: "📞",
		color: "#3B82F6",
		tags: ["social", "relationships", "connection"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 3,
			timeOfDay: ["any"],
			reminders: ["18:30"],
			duration: 15,
			timesPerDay: 1,
		},
	},
	{
		name: "Wash Hands",
		description: "Proper hand washing throughout the day",
		category: "any_time",
		timeCommitment: 1,
		frequency: "daily",
		benefits: ["health", "hygiene", "illness_prevention"],
		icon: "🧼",
		color: "#0EA5E9",
		tags: ["health", "hygiene", "prevention"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["morning", "afternoon", "evening"],
			reminders: [],
			duration: 1,
			timesPerDay: 5,
		},
	},
	{
		name: "Reading",
		description: "Read for knowledge or pleasure",
		category: "any_time",
		timeCommitment: 20,
		frequency: "daily",
		benefits: ["knowledge", "focus", "mental_stimulation", "stress_reduction"],
		icon: "📚",
		color: "#8B5CF6",
		tags: ["learning", "education", "leisure"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["evening"],
			reminders: ["21:00"],
			duration: 20,
			timesPerDay: 1,
		},
	},
	{
		name: "Health Checkup",
		description: "Regular health monitoring and checkups",
		category: "any_time",
		timeCommitment: 10,
		frequency: "weekly",
		benefits: ["health", "prevention", "early_detection", "longevity"],
		icon: "🏥",
		color: "#EF4444",
		tags: ["health", "prevention", "monitoring"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 1,
			timeOfDay: ["any"],
			reminders: ["09:00"],
			duration: 10,
			timesPerDay: 1,
		},
	},
	{
		name: "Weight Training",
		description: "Strength training for muscle and bone health",
		category: "any_time",
		timeCommitment: 45,
		frequency: "weekly",
		benefits: ["strength", "bone_health", "metabolism", "antiaging"],
		icon: "🏋️",
		color: "#DC2626",
		tags: ["fitness", "strength", "health"],
		difficulty: "hard",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 3,
			timeOfDay: ["any"],
			reminders: ["17:00"],
			duration: 45,
			timesPerDay: 1,
		},
	},
	{
		name: "Learn Something New",
		description: "Dedicate time to learning new skills or knowledge",
		category: "any_time",
		timeCommitment: 30,
		frequency: "daily",
		benefits: ["brain_health", "growth", "skills", "confidence"],
		icon: "🎓",
		color: "#10B981",
		tags: ["learning", "growth", "skills"],
		difficulty: "medium",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["any"],
			reminders: ["19:30"],
			duration: 30,
			timesPerDay: 1,
		},
	},
	{
		name: "Study Languages",
		description: "Practice and learn a new language",
		category: "any_time",
		timeCommitment: 20,
		frequency: "daily",
		benefits: ["brain_health", "communication", "cultural_understanding"],
		icon: "🗣️",
		color: "#F59E0B",
		tags: ["learning", "languages", "brain_training"],
		difficulty: "hard",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["any"],
			reminders: ["08:30"],
			duration: 20,
			timesPerDay: 1,
		},
	},
	{
		name: "Help Someone",
		description: "Perform an act of kindness or help others",
		category: "any_time",
		timeCommitment: 10,
		frequency: "daily",
		benefits: ["happiness", "purpose", "relationships", "community"],
		icon: "🤝",
		color: "#3B82F6",
		tags: ["kindness", "community", "purpose"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["any"],
			reminders: [],
			duration: 10,
			timesPerDay: 1,
		},
	},
	{
		name: "Have Sex",
		description: "Intimate connection with partner",
		category: "any_time",
		timeCommitment: 30,
		frequency: "weekly",
		benefits: ["stress_reduction", "bonding", "health", "happiness"],
		icon: "❤️",
		color: "#EC4899",
		tags: ["relationships", "intimacy", "health"],
		difficulty: "medium",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 3,
			timeOfDay: ["evening"],
			reminders: [],
			duration: 30,
			timesPerDay: 1,
		},
	},
	{
		name: "Prayer",
		description: "Spiritual practice and connection",
		category: "any_time",
		timeCommitment: 10,
		frequency: "daily",
		benefits: ["spirituality", "peace", "purpose", "stress_reduction"],
		icon: "🙏",
		color: "#8B5CF6",
		tags: ["spirituality", "mindfulness", "religion"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["morning", "evening"],
			reminders: ["07:00", "21:00"],
			duration: 10,
			timesPerDay: 2,
		},
	},
	{
		name: "Swimming",
		description: "Low-impact full-body exercise",
		category: "any_time",
		timeCommitment: 30,
		frequency: "weekly",
		benefits: ["fitness", "joint_health", "cardiovascular", "full_body"],
		icon: "🏊",
		color: "#0EA5E9",
		tags: ["fitness", "swimming", "low_impact"],
		difficulty: "medium",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 2,
			timeOfDay: ["any"],
			reminders: ["17:00"],
			duration: 30,
			timesPerDay: 1,
		},
	},
	{
		name: "Networking",
		description: "Connect with professional contacts",
		category: "any_time",
		timeCommitment: 30,
		frequency: "weekly",
		benefits: ["career", "opportunities", "learning", "connections"],
		icon: "🤝",
		color: "#6366F1",
		tags: ["career", "professional", "connections"],
		difficulty: "medium",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 1,
			timeOfDay: ["any"],
			reminders: ["12:00"],
			duration: 30,
			timesPerDay: 1,
		},
	},
	{
		name: "Stretching",
		description: "Flexibility and mobility exercises",
		category: "any_time",
		timeCommitment: 10,
		frequency: "daily",
		benefits: ["flexibility", "injury_prevention", "relaxation", "mobility"],
		icon: "🧘‍♀️",
		color: "#10B981",
		tags: ["fitness", "flexibility", "mobility"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["morning", "evening"],
			reminders: ["07:00", "20:00"],
			duration: 10,
			timesPerDay: 2,
		},
	},
	{
		name: "Declutter",
		description: "Organize and declutter your space",
		category: "any_time",
		timeCommitment: 15,
		frequency: "weekly",
		benefits: ["organization", "mental_clarity", "stress_reduction", "focus"],
		icon: "🧹",
		color: "#6B7280",
		tags: ["organization", "cleanliness", "mental_health"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 1,
			timeOfDay: ["any"],
			reminders: ["10:00"],
			duration: 15,
			timesPerDay: 1,
		},
	},
	{
		name: "Forced Smile",
		description: "Practice smiling to boost mood",
		category: "any_time",
		timeCommitment: 1,
		frequency: "daily",
		benefits: ["mood", "happiness", "stress_reduction", "positivity"],
		icon: "😊",
		color: "#F59E0B",
		tags: ["mindfulness", "mood", "positivity"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["any"],
			reminders: ["09:00", "14:00", "19:00"],
			duration: 1,
			timesPerDay: 3,
		},
	},
	{
		name: "Digital Detox",
		description: "Time away from screens and digital devices",
		category: "any_time",
		timeCommitment: 60,
		frequency: "daily",
		benefits: ["mental_health", "sleep", "focus", "eye_health"],
		icon: "📵",
		color: "#1E40AF",
		tags: ["digital", "mental_health", "focus"],
		difficulty: "hard",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["evening"],
			reminders: ["21:00"],
			duration: 60,
			timesPerDay: 1,
		},
	},
	{
		name: "Cold Shower",
		description: "Cold exposure for health benefits",
		category: "morning_routine",
		timeCommitment: 3,
		frequency: "daily",
		benefits: ["immunity", "energy", "fat_loss", "mental_toughness"],
		icon: "🚿",
		color: "#0EA5E9",
		tags: ["health", "cold_exposure", "energy"],
		difficulty: "hard",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["morning"],
			reminders: ["06:45"],
			duration: 3,
			timesPerDay: 1,
		},
	},
	{
		name: "Intermittent Fasting",
		description: "Time-restricted eating window",
		category: "any_time",
		timeCommitment: 960,
		frequency: "daily",
		benefits: [
			"weight_management",
			"autophagy",
			"insulin_sensitivity",
			"energy",
		],
		icon: "⏱️",
		color: "#059669",
		tags: ["nutrition", "fasting", "health"],
		difficulty: "hard",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 7,
			timeOfDay: ["any"],
			reminders: [],
			duration: 960,
			timesPerDay: 1,
		},
	},
	{
		name: "Walking Meeting",
		description: "Have meetings while walking",
		category: "any_time",
		timeCommitment: 30,
		frequency: "weekly",
		benefits: ["fitness", "creativity", "productivity", "health"],
		icon: "🚶‍♂️",
		color: "#10B981",
		tags: ["fitness", "productivity", "work"],
		difficulty: "easy",
		isCollaborative: true,
		collaborators: [],
		participants: [],
		defaultSettings: {
			timesPerWeek: 2,
			timeOfDay: ["afternoon"],
			reminders: ["14:00"],
			duration: 30,
			timesPerDay: 1,
		},
	},
];

export async function seedHabits() {
	const db = await getDatabase();

	console.log("🧹 Clearing existing predefined habits...");
	await db.collection("habits").deleteMany({ isPredefined: true });

	console.log("🌱 Seeding habits...");

	const insertPromises = HABITS.map((habit) =>
		db.collection("habits").insertOne({
			...habit,
			isPredefined: true,
			stats: {
				totalCompletions: 0,
				bestStreak: 0,
				currentStreak: 0,
				averageCompletionTime: 0,
				successRate: 0,
				totalMinutesSpent: 0,
				completionHistory: [],
			},
			// ADD DEFAULT COLLABORATIVE PROPERTIES FOR ALL HABITS
			isCollaborative: habit.isCollaborative || false,
			collaborators: habit.collaborators || [],
			participants: habit.participants || [],
			createdAt: new Date(),
			updatedAt: new Date(),
		})
	);

	await Promise.all(insertPromises);

	console.log(`✅ Seeded ${HABITS.length} predefined habits`);

	// Count collaborative habits
	const collaborativeCount = HABITS.filter(
		(h) => h.isCollaborative === true
	).length;
	console.log(`🤝 Collaborative habits: ${collaborativeCount}`);

	// Print summary
	const categories: any = {};
	HABITS.forEach((habit) => {
		categories[habit.category] = (categories[habit.category] || 0) + 1;
	});

	console.log("\n📊 Habit Categories Summary:");
	Object.entries(categories).forEach(([category, count]) => {
		console.log(`   ${category}: ${count} habits`);
	});

	console.log("\n🎯 Difficulty Distribution:");
	const difficulties = HABITS.reduce((acc: any, habit) => {
		acc[habit.difficulty] = (acc[habit.difficulty] || 0) + 1;
		return acc;
	}, {});

	Object.entries(difficulties).forEach(([difficulty, count]) => {
		console.log(`   ${difficulty}: ${count} habits`);
	});

	console.log("\n🤝 Collaborative vs Non-collaborative:");
	console.log(`   Collaborative: ${collaborativeCount} habits`);
	console.log(
		`   Non-collaborative: ${HABITS.length - collaborativeCount} habits`
	);
}

// Run if called directly
if (require.main === module) {
	seedHabits()
		.then(() => {
			console.log("✅ Seed completed successfully");
			process.exit(0);
		})
		.catch((error) => {
			console.error("❌ Seed failed:", error);
			process.exit(1);
		});
}

export async function POST(request: NextRequest) {
	try {
		// Optional: Add admin authentication here
		// const user = await requireAuth(request);
		// if (!user.isAdmin) { ... }

		const db = await getDatabase();

		console.log("🧹 Clearing existing predefined habits...");
		await db.collection("habits").deleteMany({ isPredefined: true });

		console.log("🌱 Seeding habits...");

		const insertPromises = HABITS.map((habit) =>
			db.collection("habits").insertOne({
				...habit,
				isPredefined: true,
				stats: {
					totalCompletions: 0,
					bestStreak: 0,
					currentStreak: 0,
					averageCompletionTime: 0,
					successRate: 0,
					totalMinutesSpent: 0,
					completionHistory: [],
				},
				// ADD DEFAULT COLLABORATIVE PROPERTIES
				isCollaborative: habit.isCollaborative || false,
				collaborators: habit.collaborators || [],
				participants: habit.participants || [],
				createdAt: new Date(),
				updatedAt: new Date(),
			})
		);

		await Promise.all(insertPromises);

		console.log(`✅ Seeded ${HABITS.length} predefined habits`);

		// Count collaborative habits
		const collaborativeCount = HABITS.filter(
			(h) => h.isCollaborative === true
		).length;
		console.log(`🤝 Collaborative habits seeded: ${collaborativeCount}`);

		return NextResponse.json({
			success: true,
			message: `Seeded ${HABITS.length} habits (${collaborativeCount} collaborative)`,
			stats: {
				total: HABITS.length,
				collaborative: collaborativeCount,
				nonCollaborative: HABITS.length - collaborativeCount,
			},
		});
	} catch (error: any) {
		console.error("❌ Seed failed:", error);
		return NextResponse.json(
			{ error: { message: "Failed to seed habits", details: error.message } },
			{ status: 500 }
		);
	}
}
