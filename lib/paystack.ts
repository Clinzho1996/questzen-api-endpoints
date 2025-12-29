// lib/paystack.ts
import { config } from "dotenv";
import Paystack from "paystack-api";

// Load environment variables
config();

if (!process.env.PAYSTACK_SECRET_KEY) {
	console.error("Current working directory:", process.cwd());
	console.error(
		"PAYSTACK_SECRET_KEY exists:",
		!!process.env.PAYSTACK_SECRET_KEY
	);
	throw new Error("Please add PAYSTACK_SECRET_KEY to .env");
}

export const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY);

export const PLAN_CODES = {
	premium_monthly: process.env.PAYSTACK_PREMIUM_MONTHLY_PLAN_CODE || "",
	premium_yearly: process.env.PAYSTACK_PREMIUM_YEARLY_PLAN_CODE || "",
};
