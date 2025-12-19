import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const user = await requireAuth(request);
		const params = await context.params; // Await the params
		const body = await request.json();
		const db = await getDatabase();

		// Verify goal belongs to user
		const goal = await db.collection("goals").findOne({
			_id: new ObjectId(params.id),
			userId: new ObjectId(user.userId),
		});

		if (!goal) {
			return NextResponse.json(
				{
					error: {
						message: "Goal not found",
					},
				},
				{
					status: 404,
				}
			);
		}

		// Build update object
		const updateData: any = {
			updatedAt: new Date(),
		};

		if (body.title !== undefined) updateData.title = body.title;
		if (body.description !== undefined)
			updateData.description = body.description;
		if (body.category !== undefined) updateData.category = body.category;
		if (body.priority !== undefined) updateData.priority = body.priority;
		if (body.deadline !== undefined)
			updateData.deadline = body.deadline ? new Date(body.deadline) : null;
		if (body.tasks !== undefined) updateData.tasks = body.tasks;

		if (body.completed !== undefined) {
			updateData.completed = body.completed;
			if (body.completed) {
				updateData.completedAt = new Date();
			}
		}

		await db.collection("goals").updateOne(
			{
				_id: new ObjectId(params.id),
			},
			{
				$set: updateData,
			}
		);

		const updatedGoal = await db.collection("goals").findOne({
			_id: new ObjectId(params.id),
		});

		return NextResponse.json({
			...updatedGoal,
			id: updatedGoal!._id.toString(),
			_id: undefined,
		});
	} catch (error: any) {
		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{
					error: {
						message: "Unauthorized",
					},
				},
				{
					status: 401,
				}
			);
		}

		console.error("Update goal error:", error);
		return NextResponse.json(
			{
				error: {
					message: "Server error",
				},
			},
			{
				status: 500,
			}
		);
	}
}

export async function DELETE(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const user = await requireAuth(request);
		const params = await context.params; // Await the params
		const db = await getDatabase();

		const result = await db.collection("goals").deleteOne({
			_id: new ObjectId(params.id),
			userId: new ObjectId(user.userId),
		});

		if (result.deletedCount === 0) {
			return NextResponse.json(
				{
					error: {
						message: "Goal not found",
					},
				},
				{
					status: 404,
				}
			);
		}

		return NextResponse.json({
			message: "Goal deleted successfully",
		});
	} catch (error: any) {
		if (error.message === "Unauthorized") {
			return NextResponse.json(
				{
					error: {
						message: "Unauthorized",
					},
				},
				{
					status: 401,
				}
			);
		}

		console.error("Delete goal error:", error);
		return NextResponse.json(
			{
				error: {
					message: "Server error",
				},
			},
			{
				status: 500,
			}
		);
	}
}
