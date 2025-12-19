import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const db = await getDatabase();
    const notifications = await db.collection('notifications').find({
      userId: new ObjectId(user.userId)
    }).sort({
      createdAt: -1
    }).limit(50).toArray();
    return NextResponse.json(notifications.map(notif => ({
      ...notif,
      id: notif._id.toString(),
      _id: undefined
    })));
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
    console.error('Get notifications error:', error);
    return NextResponse.json({
      error: {
        message: 'Server error'
      }
    }, {
      status: 500
    });
  }
}