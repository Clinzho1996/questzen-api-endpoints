import { MongoClient, Db } from 'mongodb';
if (!process.env.MONGODB_URI) {
  throw new Error('Please add your MONGODB_URI to .env');
}
const uri = process.env.MONGODB_URI;
const options = {};
let client: MongoClient;
let clientPromise: Promise<MongoClient>;
declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}
if (process.env.NODE_ENV === 'development') {
  // In development, use a global variable to preserve the connection across hot reloads
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production, create a new client for each connection
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}
export async function getDatabase(): Promise<Db> {
  const client = await clientPromise;
  return client.db('questzen');
}
export default clientPromise;