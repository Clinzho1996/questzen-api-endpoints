import { habitScheduler } from "@/services/habitScheduler";
import { NextResponse } from "next/server";

export async function GET() {
	try {
		await habitScheduler.initialize();
		return NextResponse.json({
			success: true,
			message: "Habit scheduler initialized",
		});
	} catch (error) {
		return NextResponse.json(
			{
				success: false,
				error: "Failed to initialize scheduler",
			},
			{ status: 500 }
		);
	}
}
