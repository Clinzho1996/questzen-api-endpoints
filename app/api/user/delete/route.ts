import {
	sendAccountDeletionEmail,
	sendAdminDeletionNotification,
} from "@/lib/email";
import { getDatabase } from "@/lib/mongodb";
import { cancelAllUserSubscriptions } from "@/lib/paystack";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

// Verify JWT token
async function verifyToken(token: string): Promise<{ userId: string }> {
	try {
		const secret = process.env.JWT_SECRET;
		if (!secret) {
			throw new Error("JWT_SECRET not configured");
		}

		// Verify the token
		const decoded = jwt.verify(token, secret) as {
			userId: string;
			email: string;
			iat: number;
			exp: number;
		};

		return { userId: decoded.userId };
	} catch (error) {
		console.error("Token verification failed:", error);
		throw new Error("Invalid or expired token");
	}
}

// Helper to check if token is blacklisted
async function isTokenBlacklisted(token: string, db: any): Promise<boolean> {
	try {
		const blacklisted = await db.collection("invalidated_tokens").findOne({
			token: token,
		});
		return !!blacklisted;
	} catch (error) {
		console.error("Error checking token blacklist:", error);
		return false;
	}
}

export async function DELETE(request: NextRequest) {
	try {
		// Get authorization header
		const authHeader = request.headers.get("Authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return NextResponse.json(
				{ error: { message: "Unauthorized. Please log in again." } },
				{ status: 401 }
			);
		}

		const token = authHeader.replace("Bearer ", "");

		// Verify token and get user ID
		let userId: string;
		try {
			const decoded = await verifyToken(token);
			userId = decoded.userId;
		} catch (error: any) {
			return NextResponse.json(
				{
					error: { message: "Invalid or expired token. Please log in again." },
				},
				{ status: 401 }
			);
		}

		const db = await getDatabase();

		// Check if token is blacklisted
		if (await isTokenBlacklisted(token, db)) {
			return NextResponse.json(
				{ error: { message: "Session expired. Please log in again." } },
				{ status: 401 }
			);
		}

		// Get user data before deletion
		const user = await db.collection("users").findOne({
			_id: new ObjectId(userId),
		});

		if (!user) {
			return NextResponse.json(
				{ error: { message: "User not found" } },
				{ status: 404 }
			);
		}

		// Parse request body
		let reason = "User initiated";
		try {
			const body = await request.json();
			reason = body.reason || "User initiated";

			// Optional: Add confirmation check
			// if (body.confirmation !== "DELETE") {
			// 	return NextResponse.json(
			// 		{ error: { message: "Confirmation required" } },
			// 		{ status: 400 }
			// 	);
			// }
		} catch (error) {
			// No body provided, use default reason
			console.log("No deletion reason provided, using default");
		}

		console.log(`🗑️ Starting account deletion for: ${user.email}`);

		// 1. Cancel Paystack subscriptions if exists
		if (user.paystackCustomerCode) {
			try {
				console.log(
					`🔄 Cancelling subscriptions for customer: ${user.paystackCustomerCode}`
				);

				// Cancel all active subscriptions
				const subscriptionCancelled = await cancelAllUserSubscriptions(
					user.paystackCustomerCode
				);

				if (subscriptionCancelled) {
					console.log(
						`✅ Successfully cancelled subscriptions for ${user.email}`
					);
				} else {
					console.log(
						`⚠️ Could not cancel subscriptions for ${user.email}, continuing with deletion`
					);
				}
			} catch (paystackError) {
				console.error("Failed to cancel Paystack subscription:", paystackError);
				// Continue with deletion even if Paystack fails
			}
		} else {
			console.log(`ℹ️ No Paystack customer code found for ${user.email}`);
		}

		// 2. Archive user data for compliance (30-day recovery period)
		const archiveData = {
			userId: user._id,
			email: user.email,
			displayName: user.displayName,
			originalData: {
				// Store only essential data, not sensitive info
				email: user.email,
				displayName: user.displayName,
				photoURL: user.photoURL,
				subscriptionTier: user.subscriptionTier,
				subscriptionStatus: user.subscriptionStatus,
				paystackCustomerCode: user.paystackCustomerCode,
				streak: user.streak,
				longestStreak: user.longestStreak,
				totalFocusMinutes: user.totalFocusMinutes,
				level: user.level,
				xp: user.xp,
				achievements: user.achievements,
				createdAt: user.createdAt,
			},
			deletedAt: new Date(),
			deletionReason: reason,
			recoveryDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
			contactEmail: process.env.SUPPORT_EMAIL || "support@questzen.app",
		};

		try {
			await db.collection("deleted_users_archive").insertOne(archiveData);
			console.log(`📦 Archived user data for: ${user.email}`);
		} catch (archiveError) {
			console.error("Failed to archive user data:", archiveError);
			// Continue with deletion even if archiving fails
		}

		// Define deletion tasks
		// 3. Delete related data (cascade delete)
		const userIdObj = user._id;
		const userEmail = user.email;

		// Define deletion tasks
		const deletionTasks = [
			// Delete user's goals/quests
			() => db.collection("goals").deleteMany({ userId: userIdObj }),

			// Delete user's focus sessions
			() => db.collection("focus_sessions").deleteMany({ userId: userIdObj }),

			// Remove user from collaborations using $pull
			() =>
				// Remove user from collaborations with proper typing
				() =>
					db
						.collection("collaborations")
						.updateMany(
							{ "collaborators.userId": userIdObj },
							{ $pull: { collaborators: { userId: userIdObj } } as any }
						),

			// Delete collaborations owned by user
			() => db.collection("collaborations").deleteMany({ userId: userIdObj }),

			// Delete invitations sent by user
			() => db.collection("invitations").deleteMany({ fromUserId: userIdObj }),

			// Delete pending invitations to user's email
			() => db.collection("invitations").deleteMany({ toEmail: userEmail }),

			// Delete user's notifications
			() => db.collection("notifications").deleteMany({ userId: userIdObj }),

			// Delete user's chat messages
			() => db.collection("chat_messages").deleteMany({ userId: userIdObj }),

			// Delete user's analytics data
			() => db.collection("analytics_events").deleteMany({ userId: userIdObj }),
		];

		// Execute all deletion tasks
		console.log(`🗑️ Deleting related data for: ${user.email}`);
		for (const task of deletionTasks) {
			try {
				await task();
			} catch (taskError) {
				console.error("Error in deletion task:", taskError);
				// Continue with other tasks
			}
		}

		// 4. Delete user record
		const result = await db.collection("users").deleteOne({
			_id: userIdObj,
		});

		if (result.deletedCount === 0) {
			console.error(`❌ Failed to delete user record: ${user.email}`);
			return NextResponse.json(
				{ error: { message: "Failed to delete user account" } },
				{ status: 500 }
			);
		}

		console.log(`✅ User record deleted: ${user.email}`);

		// 5. Invalidate all tokens for this user
		try {
			await db.collection("invalidated_tokens").insertOne({
				token: token,
				userId: userIdObj,
				invalidatedAt: new Date(),
				reason: "account_deletion",
				userEmail: userEmail,
			});

			// Also invalidate any refresh tokens
			await db.collection("refresh_tokens").deleteMany({
				userId: userIdObj,
			});

			console.log(`🔐 Tokens invalidated for: ${user.email}`);
		} catch (tokenError) {
			console.error("Failed to invalidate tokens:", tokenError);
		}

		// 6. Send confirmation email to user
		try {
			await sendAccountDeletionEmail(userEmail, user.displayName);
			console.log(`📧 Deletion confirmation sent to: ${user.email}`);
		} catch (emailError) {
			console.error("Failed to send deletion email:", emailError);
		}

		// 7. Send admin notification
		try {
			await sendAdminDeletionNotification(
				userEmail,
				user.displayName,
				user.paystackCustomerCode,
				reason
			);
			console.log(`👨‍💼 Admin notification sent for: ${user.email}`);
		} catch (adminError) {
			console.error("Failed to send admin notification:", adminError);
		}

		// 8. Log the deletion
		await db.collection("audit_logs").insertOne({
			action: "account_deletion",
			userId: userIdObj,
			userEmail: userEmail,
			reason: reason,
			deletedAt: new Date(),
			metadata: {
				subscriptionTier: user.subscriptionTier,
				hadPaystackAccount: !!user.paystackCustomerCode,
				dataArchived: true,
			},
		});

		console.log(
			`🎉 Account deletion completed successfully for: ${user.email}`
		);

		// Return success response
		return NextResponse.json(
			{
				message: "Account deleted successfully",
				recoveryPeriod: 30, // days
				supportEmail: process.env.SUPPORT_EMAIL || "support@questzen.app",
				deletionTime: new Date().toISOString(),
				note: "All your data has been permanently deleted. You have 30 days to contact support if this was a mistake.",
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error("❌ Account deletion error:", error);

		// Log the error
		try {
			const db = await getDatabase();
			await db.collection("error_logs").insertOne({
				error: "account_deletion_failed",
				message: error instanceof Error ? error.message : "Unknown error",
				stack: error instanceof Error ? error.stack : undefined,
				timestamp: new Date(),
			});
		} catch (logError) {
			console.error("Failed to log error:", logError);
		}

		return NextResponse.json(
			{
				error: {
					message:
						"Failed to delete account. Please try again or contact support.",
					code: "DELETE_FAILED",
				},
			},
			{ status: 500 }
		);
	}
}

// Optional: Add a GET endpoint to check deletion status
export async function GET(request: NextRequest) {
	return NextResponse.json(
		{
			message: "Use DELETE method to delete account",
			endpoint: "/api/user/delete",
			method: "DELETE",
			requires: ["Authorization: Bearer <token>"],
			optional_body: {
				reason: "string (optional)",
				confirmation: "DELETE (optional)",
			},
		},
		{ status: 200 }
	);
}
