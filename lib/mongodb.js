import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGODB_URI;
let cachedClient = null;
let cachedDb = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return cachedDb;
  }

  try {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      retryWrites: true,
      w: 'majority'
    });

    await client.connect();
    const db = client.db(process.env.DATABASE_NAME);
    
    cachedClient = client;
    cachedDb = db;
    
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

export async function updateLeaderboard(db) {
  try {
    const players = await db.collection("Players").find({}).toArray();

    players.sort((a, b) => b.totalWinnings - a.totalWinnings);

    const leaderboardData = players.map((player, index) => {
      const winRate =
        player.gamesPlayed > 0 ? (player.wins / player.gamesPlayed) * 100 : 0;
      const avgWin = player.wins > 0 ? player.totalWon / player.wins : 0;

      return {
        ...player,
        rank: index + 1,
        winRate,
        avgWin,
        updatedAt: new Date(),
      };
    });

    await db.collection("Leaderboard").deleteMany({});
    if (leaderboardData.length > 0) {
      await db.collection("Leaderboard").insertMany(leaderboardData);
    }
  } catch (error) {
    console.error("Error updating leaderboard:", error);
  }
}