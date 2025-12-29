// lib/paystack.ts - Using REST API directly
export interface PaystackCustomer {
	id: number;
	customer_code: string;
	email: string;
	first_name: string;
	last_name: string;
	phone?: string;
	metadata?: Record<string, any>;
}

export interface PaystackTransaction {
	authorization_url: string;
	access_code: string;
	reference: string;
}

export interface PaystackPlan {
	plan_code: string;
	name: string;
	amount: number;
	interval: string;
}

class PaystackAPI {
	private secretKey: string;
	private baseURL = "https://api.paystack.co";

	constructor() {
		const secretKey = process.env.PAYSTACK_SECRET_KEY;
		if (!secretKey) {
			throw new Error("PAYSTACK_SECRET_KEY environment variable is required");
		}
		this.secretKey = secretKey;
	}

	private async request<T>(
		method: string,
		endpoint: string,
		data?: any
	): Promise<T> {
		const url = `${this.baseURL}${endpoint}`;
		const headers = {
			Authorization: `Bearer ${this.secretKey}`,
			"Content-Type": "application/json",
		};

		const response = await fetch(url, {
			method,
			headers,
			body: data ? JSON.stringify(data) : undefined,
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(
				`Paystack API error: ${response.status} - ${
					error.message || response.statusText
				}`
			);
		}

		return response.json();
	}

	// Customer methods
	async createCustomer(data: {
		email: string;
		first_name?: string;
		last_name?: string;
		phone?: string;
		metadata?: Record<string, any>;
	}): Promise<{ data: PaystackCustomer }> {
		return this.request("POST", "/customer", data);
	}

	async getCustomer(customerCode: string): Promise<{ data: PaystackCustomer }> {
		return this.request("GET", `/customer/${customerCode}`);
	}

	// Transaction methods
	async initializeTransaction(data: {
		email: string;
		amount: number;
		reference?: string;
		callback_url?: string;
		plan?: string;
		metadata?: Record<string, any>;
		channels?: string[];
	}): Promise<{ data: PaystackTransaction }> {
		return this.request("POST", "/transaction/initialize", data);
	}

	async verifyTransaction(reference: string): Promise<{ data: any }> {
		return this.request("GET", `/transaction/verify/${reference}`);
	}

	// Plan methods
	async createPlan(data: {
		name: string;
		amount: number;
		interval: string;
		currency?: string;
		description?: string;
	}): Promise<{ data: PaystackPlan }> {
		return this.request("POST", "/plan", data);
	}

	async getPlan(planCode: string): Promise<{ data: PaystackPlan }> {
		return this.request("GET", `/plan/${planCode}`);
	}
}

// Singleton instance
let paystackInstance: PaystackAPI | null = null;

export function getPaystack(): PaystackAPI {
	if (!paystackInstance) {
		paystackInstance = new PaystackAPI();
	}
	return paystackInstance;
}

export const PLAN_CODES = {
	premium_monthly: process.env.PAYSTACK_PREMIUM_MONTHLY_PLAN_CODE || "",
	premium_yearly: process.env.PAYSTACK_PREMIUM_YEARLY_PLAN_CODE || "",
};
