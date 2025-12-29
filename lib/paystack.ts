// lib/paystack.ts
import Paystack from "paystack-api";

export function getPaystack() {
	const secretKey = process.env.PAYSTACK_SECRET_KEY;

	if (!secretKey) {
		throw new Error("PAYSTACK_SECRET_KEY is not defined");
	}

	return new Paystack(secretKey);
}

export const PLAN_CODES = {
	premium_monthly: process.env.PAYSTACK_PREMIUM_MONTHLY_PLAN_CODE ?? "",
	premium_yearly: process.env.PAYSTACK_PREMIUM_YEARLY_PLAN_CODE ?? "",
};
