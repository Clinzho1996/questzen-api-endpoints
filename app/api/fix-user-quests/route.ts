// app/api/fix-user-quests/route.ts
import { requireAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const user = await requireAuth(request);
		const db = await getDatabase();

		console.log("🔍 Current user:", {
			userId: user.userId,
			email: user.email,
		});

		// Find current user in database
		const currentUser = await db.collection("users").findOne({
			$or: [{ _id: new ObjectId(user.userId) }, { email: user.email }],
		});

		if (!currentUser) {
			return NextResponse.json(
				{ error: "User not found in database" },
				{ status: 404 }
			);
		}

		const currentUserId = currentUser._id.toString();
		console.log("✅ Current user MongoDB ID:", currentUserId);

		// Find ALL quests in the database
		const allQuests = await db.collection("goals").find({}).toArray();

		console.log(`📊 Found ${allQuests.length} total quests in database`);

		// Find quests that SHOULD belong to current user but have different owner ID
		const questsToUpdate = allQuests.filter((quest) => {
			// Skip if no userId
			if (!quest.userId) return false;

			const questOwnerId = quest.userId?.toString?.();
			const questTitle = quest.title;
			const questEmail = quest.ownerDetails?.email;

			// Check if quest has your email but wrong ID
			const hasYourEmail = questEmail === user.email;
			const hasWrongId = questOwnerId !== currentUserId;

			if (hasYourEmail && hasWrongId) {
				console.log(`🔍 Quest "${questTitle}":`);
				console.log(`   - Has your email: ${questEmail}`);
				console.log(`   - Current owner ID: ${questOwnerId}`);
				console.log(`   - Should be your ID: ${currentUserId}`);
				return true;
			}

			return false;
		});

		console.log(`🔄 Need to update ${questsToUpdate.length} quests`);

		// Update all quests to have correct user ID
		let updatedCount = 0;
		for (const quest of questsToUpdate) {
			try {
				const result = await db.collection("goals").updateOne(
					{ _id: quest._id },
					{
						$set: {
							userId: currentUser._id, // Correct ObjectId
							"ownerDetails.id": currentUserId,
							"ownerDetails.firebaseUid": currentUser.firebaseUid,
							"ownerDetails.email": currentUser.email,
							"ownerDetails.displayName": currentUser.displayName,
							"ownerDetails.photoURL": currentUser.photoURL,
							updatedAt: new Date(),
						},
					}
				);

				if (result.modifiedCount > 0) {
					updatedCount++;
					console.log(`✅ Updated quest: "${quest.title}"`);
				}
			} catch (error) {
				console.error(`❌ Error updating quest ${quest._id}:`, error);
			}
		}

		// Also update user_goals collection
		try {
			const userGoalsResult = await db.collection("user_goals").updateMany(
				{
					$or: [
						{ userId: "694ff3f4e6f3ad68b3e11e55" },
						{ userFirebaseUid: "694ff3f4e6f3ad68b3e11e55" },
					],
				},
				{
					$set: {
						userId: currentUserId,
						userFirebaseUid: currentUser.firebaseUid,
						updatedAt: new Date(),
					},
				}
			);

			console.log(
				`✅ Updated ${userGoalsResult.modifiedCount} entries in user_goals`
			);
		} catch (error) {
			console.log("ℹ️ Could not update user_goals:", error);
		}

		return NextResponse.json({
			success: true,
			message: `Updated ${updatedCount} quests to your user ID`,
			details: {
				yourUserId: currentUserId,
				yourEmail: currentUser.email,
				questsUpdated: updatedCount,
				totalQuests: allQuests.length,
			},
		});
	} catch (error: any) {
		console.error("❌ Fix quests error:", error);
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}
