import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const allowedOrigins = [
	"https://questzenai.devclinton.org",
	"http://localhost:5173",
	"http://localhost:3000",
];

export function middleware(request: NextRequest) {
	// Check the origin from the request
	const origin = request.headers.get("origin") || "";
	const isAllowedOrigin = allowedOrigins.includes(origin);

	// Handle preflight requests
	if (request.method === "OPTIONS") {
		const response = new NextResponse(null, { status: 200 });

		if (isAllowedOrigin) {
			response.headers.set("Access-Control-Allow-Origin", origin);
		}
		response.headers.set(
			"Access-Control-Allow-Methods",
			"GET, POST, PUT, DELETE, OPTIONS"
		);
		response.headers.set(
			"Access-Control-Allow-Headers",
			"Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version"
		);
		response.headers.set("Access-Control-Max-Age", "86400");
		response.headers.set("Access-Control-Allow-Credentials", "true");

		return response;
	}

	// Handle actual requests
	const response = NextResponse.next();

	if (isAllowedOrigin) {
		response.headers.set("Access-Control-Allow-Origin", origin);
	}
	response.headers.set("Access-Control-Allow-Credentials", "true");
	response.headers.set(
		"Access-Control-Allow-Methods",
		"GET, POST, PUT, DELETE, OPTIONS"
	);

	return response;
}

// Apply middleware to API routes only
export const config = {
	matcher: "/api/:path*",
};
