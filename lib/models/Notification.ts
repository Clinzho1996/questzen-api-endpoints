import { ObjectId } from 'mongodb';
export interface Notification {
  _id?: ObjectId;
  userId: ObjectId;
  type: 'goal_reminder' | 'achievement' | 'streak' | 'system';
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string;
  createdAt: Date;
}