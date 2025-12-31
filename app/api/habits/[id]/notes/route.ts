// app/api/habits/[id]/notes/route.ts
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

async function resolveCurrentUser(db: any, user: any) {
	let currentUser = null;

	if (user.userId && ObjectId.isValid(user.userId)) {
		currentUser = await db
			.collection("users")
			.findOne(
				{ _id: new ObjectId(user.userId) },
				{
					projection: {
						_id: 1,
						firebaseUid: 1,
						email: 1,
						displayName: 1,
						photoURL: 1,
					},
				}
			);
	}

	if (!currentUser && user.userId) {
		currentUser = await db
			.collection("users")
			.findOne(
				{ firebaseUid: user.userId },
				{
					projection: {
						_id: 1,
						firebaseUid: 1,
						email: 1,
						displayName: 1,
						photoURL: 1,
					},
				}
			);
	}

	if (!currentUser && user.email) {
		currentUser = await db
			.collection("users")
			.findOne(
				{ email: user.email.toLowerCase().trim() },
				{
					projection: {
						_id: 1,
						firebaseUid: 1,
						email: 1,
						displayName: 1,
						photoURL: 1,
					},
				}
			);
	}

	if (!currentUser) {
		const newUser = {
			firebaseUid: user.userId,
			email: user.email || "",
			displayName: user.email?.split("@")[0] || "QuestZen User",
			photoURL: "",
			subscriptionTier: "free",
			subscriptionStatus: "inactive",
			streak: 0,
			longestStreak: 0,
			totalFocusMinutes: 0,
			level: 1,
			xp: 0,
			achievements: [],
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const result = await db.collection("users").insertOne(newUser);

		currentUser = {
			_id: result.insertedId,
			firebaseUid: newUser.firebaseUid,
			email: newUser.email,
			displayName: newUser.displayName,
			photoURL: "",
		};
	}

	return currentUser;
}

/* ===================== GET ===================== */
export async function GET(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const { id: habitId } = await context.params;

		if (!ObjectId.isValid(habitId)) {
			return NextResponse.json({ error: "Invalid habit id" }, { status: 400 });
		}

		const user = await requireAuth(request);
		const db = await getDatabase();
		const currentUser = await resolveCurrentUser(db, user);

		const notes = await db
			.collection("habit_notes")
			.find({
				habitId: new ObjectId(habitId),
				userId: currentUser._id,
			})
			.sort({ createdAt: -1 })
			.toArray();

		return NextResponse.json(notes);
	} catch (error) {
		console.error("Get habit notes error:", error);
		return NextResponse.json(
			{ error: { message: "Failed to fetch habit notes" } },
			{ status: 500 }
		);
	}
}

/* ===================== POST ===================== */
export async function POST(
	request: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const { id: habitId } = await context.params;

		if (!ObjectId.isValid(habitId)) {
			return NextResponse.json({ error: "Invalid habit id" }, { status: 400 });
		}

		const { content } = await request.json();

		if (!content || typeof content !== "string") {
			return NextResponse.json(
				{ error: "Note content is required" },
				{ status: 400 }
			);
		}

		const user = await requireAuth(request);
		const db = await getDatabase();
		const currentUser = await resolveCurrentUser(db, user);

		const note = {
			habitId: new ObjectId(habitId),
			userId: currentUser._id,
			content,
			date: new Date().toISOString().split("T")[0],
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const result = await db.collection("habit_notes").insertOne(note);

		return NextResponse.json({
			id: result.insertedId,
			habitId,
			content,
			date: note.date,
			createdAt: note.createdAt,
		});
	} catch (error) {
		console.error("Add habit note error:", error);
		return NextResponse.json(
			{ error: { message: "Failed to add note" } },
			{ status: 500 }
		);
	}
}
