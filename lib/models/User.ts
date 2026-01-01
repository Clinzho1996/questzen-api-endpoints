import { ObjectId } from "mongodb";

// Update your User interface to include XP history
export interface User {
	_id?: ObjectId;
	email: string;
	password?: string; // Make optional for Firebase users
	displayName: string;
	photoURL?: string | null;

	// 🔥 NEW FIELDS FOR FIREBASE
	firebaseUid?: string; // Firebase user ID
	provider?: "email" | "google" | "firebase"; // Auth provider
	subscriptionTier: "free" | "premium";
	subscriptionStatus: "active" | "cancelled" | "expired" | "inactive";

	stripeCustomerId?: string;
	stripeSubscriptionId?: string;
	subscriptionDetails?: {
		planCode: string;
		planName: string;
		status: "active" | "cancelled" | "expired" | "inactive";
		nextPaymentDate?: string;
		amount: number;
		currency: string;
		interval: "monthly" | "yearly";
		startDate: string;
		cancelledAt?: string;
		endsAt?: string;
	};
	// Stats
	streak: number;
	longestStreak: number;
	lastActiveDate?: Date;
	totalFocusMinutes: number;
	level: number;
	xp: number;
	achievements: string[];

	// ADD XP HISTORY FOR TIME FILTERING
	xpHistory?: Array<{
		date: Date;
		amount: number;
		source: "habit" | "focus" | "goal" | "achievement" | "other";
		description?: string;
		metadata?: Record<string, any>;
	}>;

	// Additional stats that might be useful
	completedGoals?: number;
	focusSessions?: number;
	completedHabits?: number; // ADD THIS FOR HABITS
	premiumSince?: Date;
	subscriptionStartDate?: Date;
	lastPaymentDate?: Date;
	nextBillingDate?: Date;
	subscriptionEndDate?: Date;
	cancelledAt?: Date;
	// Timestamps
	createdAt: Date;
	updatedAt: Date;
}

export function updateStreak(user: User): User {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const lastActive = user.lastActiveDate ? new Date(user.lastActiveDate) : null;

	if (!lastActive) {
		user.streak = 1;
		user.lastActiveDate = today;
		return user;
	}

	lastActive.setHours(0, 0, 0, 0);
	const diffDays = Math.floor(
		(today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
	);

	if (diffDays === 0) {
		// Same day, no change
		return user;
	} else if (diffDays === 1) {
		// Consecutive day
		user.streak += 1;
		if (user.streak > user.longestStreak) {
			user.longestStreak = user.streak;
		}
	} else {
		// Streak broken
		user.streak = 1;
	}

	user.lastActiveDate = today;
	return user;
}
