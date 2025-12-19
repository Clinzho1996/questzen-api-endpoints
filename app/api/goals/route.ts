import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { Goal } from '@/lib/models/Goal';
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const db = await getDatabase();
    const goals = await db.collection('goals').find({
      userId: new ObjectId(user.userId)
    }).sort({
      createdAt: -1
    }).toArray();
    return NextResponse.json(goals.map(goal => ({
      ...goal,
      id: goal._id.toString(),
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
    console.error('Get goals error:', error);
    return NextResponse.json({
      error: {
        message: 'Server error'
      }
    }, {
      status: 500
    });
  }
}
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const {
      title,
      description,
      category,
      priority,
      deadline
    } = body;

    // Validation
    if (!title || !category) {
      return NextResponse.json({
        error: {
          message: 'Title and category are required'
        }
      }, {
        status: 400
      });
    }
    const db = await getDatabase();
    const newGoal: Omit<Goal, '_id'> = {
      userId: new ObjectId(user.userId),
      title,
      description: description || '',
      category,
      priority: priority || 'medium',
      deadline: deadline ? new Date(deadline) : undefined,
      tasks: [],
      completed: false,
      aiSuggestions: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await db.collection('goals').insertOne(newGoal);
    return NextResponse.json({
      ...newGoal,
      id: result.insertedId.toString(),
      userId: user.userId
    }, {
      status: 201
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
    console.error('Create goal error:', error);
    return NextResponse.json({
      error: {
        message: 'Server error'
      }
    }, {
      status: 500
    });
  }
}