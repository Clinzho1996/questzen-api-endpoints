import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const allowedOrigins = [
	"https://questzenai.devclinton.org",
	"http://localhost:5173", // Vite dev server
	"http://localhost:3000", // Next.js dev server
];

export function corsMiddleware(request: NextRequest) {
	const origin = request.headers.get("origin");

	if (origin && allowedOrigins.includes(origin)) {
		return origin;
	}

	return allowedOrigins[0]; // Default to production origin
}

// Or create a middleware function for API routes
export function withCors(handler: Function) {
	return async (request: NextRequest, ...args: any[]) => {
		const response = await handler(request, ...args);

		if (response instanceof NextResponse) {
			const origin = corsMiddleware(request);
			response.headers.set("Access-Control-Allow-Origin", origin);
			response.headers.set(
				"Access-Control-Allow-Methods",
				"GET, POST, PUT, DELETE, OPTIONS"
			);
			response.headers.set(
				"Access-Control-Allow-Headers",
				"Content-Type, Authorization"
			);
			response.headers.set("Access-Control-Allow-Credentials", "true");
		}

		return response;
	};
}
