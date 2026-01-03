// scripts/setup-paystack-plans.ts - CORRECTED VERSION
import { getPaystack } from "@/lib/paystack"; // Use your custom implementation
import { config } from "dotenv";
import { resolve } from "path";

// Load from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

async function createPlans() {
	try {
		const paystack = getPaystack();

		console.log(
			"🔍 Using key:",
			process.env.PAYSTACK_SECRET_KEY?.substring(0, 20) + "..."
		);

		console.log("📝 Creating Monthly Plan...");
		const monthlyPlan = await paystack.createPlan({
			name: "Premium Monthly",
			amount: 250000, // ₦2,500
			interval: "monthly",
			currency: "NGN",
			description: "Monthly premium subscription for QuestZen AI",
		});

		console.log("✅ Monthly Plan created:", monthlyPlan.data.plan_code);

		console.log("\n📝 Creating Yearly Plan...");
		const yearlyPlan = await paystack.createPlan({
			name: "Premium Yearly",
			amount: 2800000, // ₦28,000
			interval: "annually",
			currency: "NGN",
			description: "Yearly premium subscription for QuestZen AI",
		});

		console.log("✅ Yearly Plan created:", yearlyPlan.data.plan_code);

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
	}
}

createPlans();
