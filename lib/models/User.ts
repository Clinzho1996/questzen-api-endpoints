import { ObjectId } from 'mongodb';
export interface User {
  _id?: ObjectId;
  email: string;
  password: string;
  displayName: string;
  photoURL?: string;
  subscriptionTier: 'free' | 'premium';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  streak: number;
  longestStreak: number;
  lastActiveDate?: Date;
  totalFocusMinutes: number;
  level: number;
  xp: number;
  achievements: string[];
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
  const diffDays = Math.floor((today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
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