// scripts/setup-paystack-plans.ts
import { config } from "dotenv";
import { resolve } from "path";
import Paystack from "paystack-api";

// Load from .env.local
const envPath = resolve(process.cwd(), ".env.local");
config({ path: envPath });

if (!process.env.PAYSTACK_SECRET_KEY) {
	console.error("❌ PAYSTACK_SECRET_KEY not found in .env.local");
	process.exit(1);
}

const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY!);

async function createPlans() {
	try {
		console.log("📝 Creating Monthly Plan...");

		const monthlyPlan = await paystack.plan.create({
			name: "Premium Monthly",
			amount: 200000,
			interval: "monthly",
			currency: "NGN",
			description: "Monthly premium subscription for QuestZen AI",
			send_invoices: true,
			send_sms: true,
		});

		console.log("✅ Monthly Plan created!");
		console.log("   Plan Code:", monthlyPlan.data.plan_code);

		console.log("\n📝 Creating Yearly Plan...");

		// FIXED: Changed "yearly" to "annually"
		const yearlyPlan = await paystack.plan.create({
			name: "Premium Yearly",
			amount: 2100000,
			interval: "annually", // Paystack uses "annually", not "yearly"
			currency: "NGN",
			description: "Yearly premium subscription for QuestZen AI",
			send_invoices: true,
			send_sms: true,
		});

		console.log("✅ Yearly Plan created!");
		console.log("   Plan Code:", yearlyPlan.data.plan_code);

		console.log("\n📋 UPDATE YOUR .env.local FILE:");
		console.log("=".repeat(50));
		console.log(
			`PAYSTACK_PREMIUM_MONTHLY_PLAN_CODE=${monthlyPlan.data.plan_code}`
		);
		console.log(
			`PAYSTACK_PREMIUM_YEARLY_PLAN_CODE=${yearlyPlan.data.plan_code}`
		);
		console.log("=".repeat(50));
	} catch (error: any) {
		console.error("❌ Error:", error.message);
		if (error.response?.data) {
			console.error("Details:", error.response.data);
		}
	}
}

createPlans();
