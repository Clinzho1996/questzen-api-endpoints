// lib/paystack.ts - CORRECTED
import Paystack from "paystack-api";

// Use a singleton pattern to avoid recreating instances
let paystackInstance: Paystack | null = null;

export function getPaystack(): Paystack {
	if (paystackInstance) {
		return paystackInstance;
	}

	const secretKey = process.env.PAYSTACK_SECRET_KEY;

	if (!secretKey) {
		console.error("❌ PAYSTACK_SECRET_KEY is not defined");
		console.error(
			"Current env vars:",
			Object.keys(process.env).filter((k) => k.includes("PAYSTACK"))
		);
		throw new Error("PAYSTACK_SECRET_KEY is not defined");
	}

	console.log(
		"🔑 Paystack initialized with key:",
		secretKey.substring(0, 10) + "..."
	);

	// Paystack constructor only takes the API key as argument
	paystackInstance = new Paystack(secretKey);

	return paystackInstance;
}

export const PLAN_CODES = {
	premium_monthly: process.env.PAYSTACK_PREMIUM_MONTHLY_PLAN_CODE ?? "",
	premium_yearly: process.env.PAYSTACK_PREMIUM_YEARLY_PLAN_CODE ?? "",
};

// Test function to verify configuration
export function testPaystackConfig() {
	console.log("🔍 Testing Paystack configuration:");
	console.log("PAYSTACK_SECRET_KEY exists:", !!process.env.PAYSTACK_SECRET_KEY);
	console.log(
		"PAYSTACK_PREMIUM_MONTHLY_PLAN_CODE:",
		process.env.PAYSTACK_PREMIUM_MONTHLY_PLAN_CODE || "Not set"
	);
	console.log(
		"PAYSTACK_PREMIUM_YEARLY_PLAN_CODE:",
		process.env.PAYSTACK_PREMIUM_YEARLY_PLAN_CODE || "Not set"
	);

	if (!process.env.PAYSTACK_SECRET_KEY) {
		throw new Error("PAYSTACK_SECRET_KEY environment variable is required");
	}
}
