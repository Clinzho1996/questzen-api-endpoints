// scripts/fix-missing-subscriptions.js
import { getDatabase } from "@/lib/mongodb";
import { getPaystack } from "@/lib/paystack";
import "dotenv/config"; // Add this line at the top

async function fixMissingSubscriptions() {
	const db = await getDatabase();
	const paystack = getPaystack();

	console.log("🔧 Starting subscription fix script...");

	// Find all premium users
	const users = await db
		.collection("users")
		.find({
			subscriptionTier: "premium",
			subscriptionStatus: "active",
			paystackCustomerCode: { $exists: true, $ne: null },
		})
		.toArray();

	console.log(`Found ${users.length} premium users`);

	for (const user of users) {
		try {
			console.log(`\n--- Processing: ${user.email} ---`);

			// Check if user already has subscription code
			if (user.paystackSubscriptionCode) {
				console.log(
					`Already has subscription code: ${user.paystackSubscriptionCode}`
				);
				continue;
			}

			// Get customer details from Paystack
			const customer = await paystack.getCustomer(user.paystackCustomerCode);
			console.log(`Customer found: ${customer.data.email}`);

			// Get customer's subscriptions
			try {
				const subscriptions = await paystack.listSubscriptions({
					customer: user.paystackCustomerCode,
				});

				if (subscriptions.data && subscriptions.data.length > 0) {
					// Get the most recent active subscription
					const activeSubs = subscriptions.data.filter(
						(sub) => sub.status === "active" || sub.status === "non-renewing"
					);

					if (activeSubs.length > 0) {
						const latestSub = activeSubs.sort(
							(a, b) => new Date(b.createdAt) - new Date(a.createdAt)
						)[0];

						console.log(`Found subscription: ${latestSub.subscription_code}`);

						// Update user with subscription code
						await db.collection("users").updateOne(
							{ _id: user._id },
							{
								$set: {
									paystackSubscriptionCode: latestSub.subscription_code,
									plan: latestSub.plan?.interval?.includes("annually")
										? "yearly"
										: "monthly",
									nextBillingDate: latestSub.next_payment_date
										? new Date(latestSub.next_payment_date)
										: user.plan === "yearly"
										? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
										: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
								},
							}
						);

						console.log(`✅ Updated ${user.email}`);
					} else {
						console.log(`No active subscriptions found for ${user.email}`);
					}
				} else {
					console.log(`No subscriptions found for ${user.email}`);
				}
			} catch (subError) {
				console.log(`No subscriptions or error: ${subError.message}`);
			}
		} catch (error) {
			console.error(`❌ Error processing ${user.email}:`, error.message);
		}
	}

	console.log("\n✅ Fix script completed!");
}

// Run the script
fixMissingSubscriptions().catch(console.error);
