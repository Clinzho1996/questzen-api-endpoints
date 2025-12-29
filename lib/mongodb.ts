// lib/mongodb.ts
import { Db, MongoClient } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDatabase(): Promise<Db> {
	if (db) return db;

	const uri = process.env.MONGODB_URI;
	if (!uri) {
		throw new Error("MONGODB_URI is not defined");
	}

	client = new MongoClient(uri);
	await client.connect();

	db = client.db("questzen");
	return db;
}
