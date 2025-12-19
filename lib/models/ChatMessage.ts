import { ObjectId } from 'mongodb';
export interface ChatMessage {
  _id?: ObjectId;
  userId: ObjectId;
  goalId?: ObjectId;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}