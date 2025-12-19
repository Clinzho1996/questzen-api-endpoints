import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const db = await getDatabase();
    const userData = await db.collection('users').findOne({
      _id: new ObjectId(user.userId)
    }, {
      projection: {
        password: 0
      }
    });
    if (!userData) {
      return NextResponse.json({
        error: {
          message: 'User not found'
        }
      }, {
        status: 404
      });
    }
    return NextResponse.json({
      id: userData._id.toString(),
      email: userData.email,
      displayName: userData.displayName,
      photoURL: userData.photoURL,
      subscriptionTier: userData.subscriptionTier,
      streak: userData.streak,
      longestStreak: userData.longestStreak,
      totalFocusMinutes: userData.totalFocusMinutes,
      level: userData.level,
      xp: userData.xp,
      achievements: userData.achievements
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
    console.error('Get user error:', error);
    return NextResponse.json({
      error: {
        message: 'Server error'
      }
    }, {
      status: 500
    });
  }
}
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const {
      displayName,
      photoURL
    } = body;
    const db = await getDatabase();
    const updateData: any = {
      updatedAt: new Date()
    };
    if (displayName) updateData.displayName = displayName;
    if (photoURL) updateData.photoURL = photoURL;
    await db.collection('users').updateOne({
      _id: new ObjectId(user.userId)
    }, {
      $set: updateData
    });
    const updatedUser = await db.collection('users').findOne({
      _id: new ObjectId(user.userId)
    }, {
      projection: {
        password: 0
      }
    });
    return NextResponse.json({
      id: updatedUser!._id.toString(),
      email: updatedUser!.email,
      displayName: updatedUser!.displayName,
      photoURL: updatedUser!.photoURL,
      subscriptionTier: updatedUser!.subscriptionTier
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
    console.error('Update user error:', error);
    return NextResponse.json({
      error: {
        message: 'Server error'
      }
    }, {
      status: 500
    });
  }
}