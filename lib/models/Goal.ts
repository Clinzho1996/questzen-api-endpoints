import { ObjectId } from "mongodb";
export interface Task {
	id: string;
	title: string;
	completed: boolean;
	createdAt: Date;
}
export interface Goal {
	_id?: ObjectId;
	userId: ObjectId;
	title: string;
	description: string;
	category:
		| "health"
		| "career"
		| "learning"
		| "finance"
		| "relationships"
		| "personal";
	priority: "low" | "medium" | "high";
	deadline?: Date;
	tasks: Task[];
	completed: boolean;
	completedAt?: Date;
	aiSuggestions?: string[];
	aiSummary?: string;
	aiFeedback?: string;
	isCollaborative?: boolean;
	collaborators?: string[];
	pendingInvitations?: string[];
	createdAt: Date;
	updatedAt: Date;
}
