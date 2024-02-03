import { MongoClient } from "mongodb";

const url = "mongodb://localhost:27017";
const mongoClient = new MongoClient(url);
const dbName = "xiaohongshu";

await mongoClient.connect();
const db = mongoClient.db(dbName);

export { db, mongoClient };

