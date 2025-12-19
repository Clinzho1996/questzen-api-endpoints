import { NextRequest, NextResponse } from 'next/server';
import { requirePremium } from '@/lib/auth';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
export async function GET(request: NextRequest) {
  try {
    const user = await requirePremium(request);
    const db = await getDatabase();

    // Get all user's goals
    const goals = await db.collection('goals').find({
      userId: new ObjectId(user.userId)
    }).toArray();
    const totalQuests = goals.length;
    const completedQuests = goals.filter(g => g.completed).length;
    const completionRate = totalQuests > 0 ? completedQuests / totalQuests * 100 : 0;

    // Category breakdown
    const categoryCount: Record<string, number> = {};
    goals.forEach(goal => {
      categoryCount[goal.category] = (categoryCount[goal.category] || 0) + 1;
    });
    const categoryBreakdown = Object.entries(categoryCount).map(([category, count]) => ({
      category,
      count,
      percentage: count / totalQuests * 100
    }));

    // Calculate average completion time
    const completedGoalsWithTime = goals.filter(g => g.completed && g.completedAt);
    let averageCompletionTime = 0;
    if (completedGoalsWithTime.length > 0) {
      const totalTime = completedGoalsWithTime.reduce((sum, goal) => {
        const created = new Date(goal.createdAt);
        const completed = new Date(goal.completedAt);
        const days = (completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        return sum + days;
      }, 0);
      averageCompletionTime = totalTime / completedGoalsWithTime.length;
    }

    // Weekly progress (last 7 days)
    const weeklyProgress = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      const completed = goals.filter(g => {
        if (!g.completedAt) return false;
        const completedDate = new Date(g.completedAt);
        return completedDate >= date && completedDate < nextDate;
      }).length;
      weeklyProgress.push({
        day: days[date.getDay()],
        completed
      });
    }

    // Monthly trend (last 6 months)
    const monthlyTrend = [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const month = date.getMonth();
      const year = date.getFullYear();
      const completed = goals.filter(g => {
        if (!g.completedAt) return false;
        const completedDate = new Date(g.completedAt);
        return completedDate.getMonth() === month && completedDate.getFullYear() === year;
      }).length;
      monthlyTrend.push({
        month: months[month],
        completed
      });
    }

    // Most productive day
    const dayCount: Record<number, number> = {};
    goals.filter(g => g.completedAt).forEach(goal => {
      const day = new Date(goal.completedAt).getDay();
      dayCount[day] = (dayCount[day] || 0) + 1;
    });
    const mostProductiveDay = Object.keys(dayCount).length > 0 ? days[parseInt(Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0][0])] : 'N/A';

    // Get user data
    const userData = await db.collection('users').findOne({
      _id: new ObjectId(user.userId)
    });
    return NextResponse.json({
      totalQuests,
      completedQuests,
      completionRate: Math.round(completionRate * 10) / 10,
      averageCompletionTime: Math.round(averageCompletionTime * 10) / 10,
      mostProductiveDay,
      categoryBreakdown,
      weeklyProgress,
      monthlyTrend,
      focusTimeTotal: userData?.totalFocusMinutes || 0,
      currentStreak: userData?.streak || 0,
      longestStreak: userData?.longestStreak || userData?.streak || 0
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({
        error: {
          message: 'Unauthorized'
        }
      }, {
        status: 401
      });
    }
    if (error.message === 'Premium subscription required') {
      return NextResponse.json({
        error: {
          message: 'Premium subscription required'
        }
      }, {
        status: 403
      });
    }
    console.error('Analytics error:', error);
    return NextResponse.json({
      error: {
        message: 'Server error'
      }
    }, {
      status: 500
    });
  }
}