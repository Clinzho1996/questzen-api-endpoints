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

export interface PaystackSubscription {
	id: number;
	domain: string;
	status: string;
	amount: number;
	customer: {
		id: number;
		customer_code: string;
		email: string;
	};
	plan: {
		id: number;
		name: string;
		plan_code: string;
		amount: number;
		interval: string;
	} | null;
	authorization: {
		authorization_code: string;
		card_type: string;
	};
	invoice_limit: number;
	subscription_code: string;
	email_token: string;
	quantity: number;
	createdAt: string;
	updatedAt: string;
	next_payment_date: string | null;
	cancelledAt?: string | null;
	ends_at?: string | null;
}

export interface PaystackSubscriptionResponse {
	data: PaystackSubscription[];
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

	// Make request method public or create a public wrapper
	public async request<T>(
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

	async createSubscription(data: {
		customer: string;
		plan: string;
		authorization: string;
		start_date?: string;
	}): Promise<{ data: PaystackSubscription }> {
		return this.request("POST", "/subscription", {
			customer: data.customer,
			plan: data.plan,
			authorization: data.authorization,
			start_date: data.start_date || new Date().toISOString(),
		});
	}

	// Add this method to check customer authorizations:
	async getCustomerAuthorizations(
		customerCode: string
	): Promise<{ data: any[] }> {
		return this.request("GET", `/customer/${customerCode}/authorization`);
	}

	// Add this method to list all subscriptions:
	async listSubscriptions(params?: {
		perPage?: number;
		page?: number;
		customer?: string;
		plan?: string;
	}): Promise<{ data: PaystackSubscription[]; meta: any }> {
		let url = "/subscription";
		const queryParams = [];

		if (params?.perPage) queryParams.push(`perPage=${params.perPage}`);
		if (params?.page) queryParams.push(`page=${params.page}`);
		if (params?.customer) queryParams.push(`customer=${params.customer}`);
		if (params?.plan) queryParams.push(`plan=${params.plan}`);

		if (queryParams.length > 0) {
			url += `?${queryParams.join("&")}`;
		}

		return this.request("GET", url);
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

	// Subscription methods
	async getCustomerSubscriptions(
		customerCode: string
	): Promise<{ data: PaystackSubscription[] }> {
		return this.request("GET", `/subscription?customer=${customerCode}`);
	}

	async disableSubscription(
		subscriptionCode: string,
		token: string
	): Promise<{ data: PaystackSubscription }> {
		return this.request("POST", `/subscription/disable`, {
			code: subscriptionCode,
			token: token,
		});
	}

	async getSubscription(
		subscriptionCode: string
	): Promise<{ data: PaystackSubscription }> {
		return this.request("GET", `/subscription/${subscriptionCode}`);
	}

	// Helper method to cancel all subscriptions for a customer
	async cancelAllUserSubscriptions(customerCode: string): Promise<boolean> {
		try {
			if (!customerCode) return true;

			// Get all subscriptions for this customer
			const response = await this.getCustomerSubscriptions(customerCode);
			const subscriptions = response.data || [];

			// Cancel active subscriptions
			const activeSubscriptions = subscriptions.filter(
				(sub) => sub.status === "active" || sub.status === "non-renewing"
			);

			if (activeSubscriptions.length === 0) {
				console.log(
					`✅ No active subscriptions found for customer: ${customerCode}`
				);
				return true;
			}

			// Cancel each subscription
			for (const subscription of activeSubscriptions) {
				try {
					// Note: Paystack requires email token to disable subscription
					// You need to store this token when creating the subscription
					await this.disableSubscription(
						subscription.id.toString(),
						subscription.email_token
					);
					console.log(
						`✅ Cancelled subscription ${subscription.id} for customer ${customerCode}`
					);
				} catch (error) {
					console.error(
						`❌ Failed to cancel subscription ${subscription.id}:`,
						error
					);
					// Continue with other subscriptions
				}
			}

			return true;
		} catch (error) {
			console.error("Error cancelling subscriptions:", error);
			return false;
		}
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

// Helper functions that use the singleton instance

export async function getCustomerSubscriptions(
	customerCode: string
): Promise<PaystackSubscriptionResponse> {
	const paystack = getPaystack();
	return paystack.getCustomerSubscriptions(customerCode);
}

export async function disableSubscription(
	subscriptionCode: string,
	token: string
): Promise<{ data: PaystackSubscription }> {
	const paystack = getPaystack();
	return paystack.disableSubscription(subscriptionCode, token);
}

export async function getSubscription(
	subscriptionCode: string
): Promise<{ data: PaystackSubscription }> {
	const paystack = getPaystack();
	return paystack.getSubscription(subscriptionCode);
}

export async function cancelAllUserSubscriptions(
	customerCode: string
): Promise<boolean> {
	const paystack = getPaystack();
	return paystack.cancelAllUserSubscriptions(customerCode);
}

// Additional helper functions

export async function createCustomer(data: {
	email: string;
	first_name?: string;
	last_name?: string;
	phone?: string;
	metadata?: Record<string, any>;
}): Promise<{ data: PaystackCustomer }> {
	const paystack = getPaystack();
	return paystack.createCustomer(data);
}

export async function initializeTransaction(data: {
	email: string;
	amount: number;
	reference?: string;
	callback_url?: string;
	plan?: string;
	metadata?: Record<string, any>;
	channels?: string[];
}): Promise<{ data: PaystackTransaction }> {
	const paystack = getPaystack();
	return paystack.initializeTransaction(data);
}

export async function verifyTransaction(
	reference: string
): Promise<{ data: any }> {
	const paystack = getPaystack();
	return paystack.verifyTransaction(reference);
}
