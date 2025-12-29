// types/paystack-api.d.ts
declare module "paystack-api" {
	interface PaystackPlan {
		id: number;
		name: string;
		plan_code: string;
		amount: number;
		interval: string;
		currency: string;
		description: string;
		send_invoices: boolean;
		send_sms: boolean;
		hosted_page: boolean;
		hosted_page_url: string | null;
		hosted_page_summary: string | null;
		created_at: string;
		updated_at: string;
	}

	interface PaystackCustomer {
		id: number;
		customer_code: string;
		email: string;
		first_name: string;
		last_name: string;
		phone: string;
		metadata: Record<string, any>;
		created_at: string;
		updated_at: string;
	}

	interface PaystackTransaction {
		id: number;
		reference: string;
		amount: number;
		currency: string;
		status: string;
		gateway_response: string;
		authorization_url: string;
		access_code: string;
		customer: PaystackCustomer;
		plan: PaystackPlan;
		metadata: Record<string, any>;
		created_at: string;
		updated_at: string;
	}

	interface PaystackResponse<T> {
		status: boolean;
		message: string;
		data: T;
	}

	interface PaystackListResponse<T> {
		status: boolean;
		message: string;
		data: T[];
		meta: {
			total: number;
			skipped: number;
			perPage: number;
			page: number;
			pageCount: number;
		};
	}

	class Paystack {
		constructor(secretKey: string);

		plan: {
			create(data: {
				name: string;
				amount: number;
				interval: string;
				currency?: string;
				description?: string;
				send_invoices?: boolean;
				send_sms?: boolean;
				hosted_page?: boolean;
				hosted_page_url?: string;
				hosted_page_summary?: string;
			}): Promise<PaystackResponse<PaystackPlan>>;

			fetch(planCode: string): Promise<PaystackResponse<PaystackPlan>>;
			list(params?: {
				perPage?: number;
				page?: number;
			}): Promise<PaystackListResponse<PaystackPlan>>;
			update(
				planCode: string,
				data: Partial<PaystackPlan>
			): Promise<PaystackResponse<PaystackPlan>>;
			delete(planCode: string): Promise<PaystackResponse<any>>;
		};

		customer: {
			create(data: {
				email: string;
				first_name?: string;
				last_name?: string;
				phone?: string;
				metadata?: Record<string, any>;
			}): Promise<PaystackResponse<PaystackCustomer>>;

			fetch(customerCode: string): Promise<PaystackResponse<PaystackCustomer>>;
			update(
				customerCode: string,
				data: Partial<PaystackCustomer>
			): Promise<PaystackResponse<PaystackCustomer>>;
		};

		transaction: {
			initialize(data: {
				email: string;
				amount: number;
				reference?: string;
				callback_url?: string;
				plan?: string;
				currency?: string;
				metadata?: Record<string, any>;
				channels?: string[];
			}): Promise<PaystackResponse<PaystackTransaction>>;

			verify(reference: string): Promise<PaystackResponse<PaystackTransaction>>;
			fetch(id: string): Promise<PaystackResponse<PaystackTransaction>>;
		};

		subscription: {
			create(data: {
				customer: string;
				plan: string;
				authorization?: string;
				start_date?: string;
			}): Promise<PaystackResponse<any>>;

			fetch(id: string): Promise<PaystackResponse<any>>;
			list(params?: {
				perPage?: number;
				page?: number;
			}): Promise<PaystackListResponse<any>>;
			disable(code: string, token: string): Promise<PaystackResponse<any>>;
			enable(code: string, token: string): Promise<PaystackResponse<any>>;
		};
	}

	export default Paystack;
}
