// app/fix/page.tsx - Create this file
"use client";

import { useState } from "react";

export default function FixPage() {
	const [result, setResult] = useState<any>(null);
	const [loading, setLoading] = useState(false);

	const fixAllHabits = async () => {
		setLoading(true);
		try {
			const response = await fetch("/api/habits/fix", {
				method: "POST",
			});
			const data = await response.json();
			setResult(data);
		} catch (error) {
			setResult({ error: String(error) });
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="p-8 max-w-4xl mx-auto">
			<h1 className="text-3xl font-bold mb-6">Fix All Habits</h1>
			<p className="mb-6 text-gray-600">
				This will update ALL habits in the database to be collaborative.
			</p>

			<button
				onClick={fixAllHabits}
				disabled={loading}
				className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 font-medium">
				{loading ? "Fixing..." : "Fix All Habits"}
			</button>

			{result && (
				<div className="mt-8 p-6 bg-gray-50 rounded-lg border">
					<h2 className="text-xl font-semibold mb-4">Results:</h2>
					<pre className="whitespace-pre-wrap bg-white p-4 rounded border">
						{JSON.stringify(result, null, 2)}
					</pre>
				</div>
			)}
		</div>
	);
}
