import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connection with connection pooling
const uri = process.env.MONGODB_URI;
let client;
let clientPromise;

if (!global._mongoClientPromise) {
  client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

// Helper function to get database
async function getDatabase() {
  try {
    const client = await clientPromise;
    const dbName = process.env.DATABASE_NAME;
    console.log("Connecting to database:", dbName);
    
    if (!dbName) {
      throw new Error("DATABASE_NAME environment variable is not set");
    }
    
    return client.db(dbName);
  } catch (error) {
    console.error("Database connection error:", error);
    throw error;
  }
}

// ---------------- API Routes ----------------

// Get all players
app.get("/api/players", async (req, res) => {
  try {
    console.log("Attempting to fetch players...");
    const db = await getDatabase();
    console.log("Database connected, database name:", db.databaseName);
    
    // Check if collection exists
    const collections = await db.listCollections().toArray();
    console.log("Available collections:", collections.map(c => c.name));
    
    const players = await db.collection("Players").find({}).toArray();
    console.log("Players found:", players.length);
    res.json(players);
  } catch (error) {
    console.error("Error fetching players:", error);
    console.error("Error details:", error.message);
    res.status(500).json({ 
      error: "Failed to fetch players",
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get recent sessions
app.get("/api/sessions", async (req, res) => {
  try {
    console.log("Attempting to fetch sessions...");
    const db = await getDatabase();
    console.log("Database connected for sessions");
    
    const sessions = await db
      .collection("Sessions")
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    console.log("Sessions found:", sessions.length);
    res.json(sessions);
  } catch (error) {
    console.error("Error fetching sessions:", error);
    console.error("Error details:", error.message);
    res.status(500).json({ 
      error: "Failed to fetch sessions",
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Record a game
app.post("/api/game", async (req, res) => {
  try {
    const { playerName, result, amount, gameType } = req.body;

    if (!playerName || !result || !amount || !gameType) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const db = await getDatabase();
    const gameAmount = result === "win" ? amount : -amount;
    const now = new Date();

    let player = await db.collection("Players").findOne({ name: playerName });

    if (!player) {
      player = {
        name: playerName,
        totalWinnings: 0,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        biggestWin: 0,
        totalWon: 0,
        totalLost: 0,
        createdAt: now,
        updatedAt: now,
      };
      const insertResult = await db.collection("Players").insertOne(player);
      player._id = insertResult.insertedId;
    }

    // Update stats
    const updateData = {
      totalWinnings: player.totalWinnings + gameAmount,
      gamesPlayed: player.gamesPlayed + 1,
      updatedAt: now,
    };

    if (result === "win") {
      updateData.wins = player.wins + 1;
      updateData.totalWon = player.totalWon + amount;
      updateData.biggestWin = Math.max(player.biggestWin, amount);
    } else {
      updateData.losses = player.losses + 1;
      updateData.totalLost = player.totalLost + amount;
    }

    await db.collection("Players").updateOne(
      { _id: player._id },
      { $set: updateData }
    );

    // Create session record
    const session = {
      playerName,
      playerId: player._id,
      result,
      amount: gameAmount,
      gameType,
      date: now,
      createdAt: now,
    };

    await db.collection("Sessions").insertOne(session);

    // Update leaderboard
    await updateLeaderboard(db);

    res.json({ success: true, message: "Game recorded successfully" });
  } catch (error) {
    console.error("Error recording game:", error);
    res.status(500).json({ error: "Failed to record game" });
  }
});

// Update leaderboard
async function updateLeaderboard(db) {
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

// Home route
app.get("/", (req, res) => {
  res.send("✅ Poker Leaderboard API is running!");
});

// Debug route to check database connection
app.get("/api/debug", async (req, res) => {
  try {
    const client = await clientPromise;
    const db = await getDatabase();
    
    // Test connection
    await client.db("admin").command({ ping: 1 });
    
    // List all databases
    const adminDb = client.db("admin");
    const databases = await adminDb.admin().listDatabases();
    
    // List collections in your database
    const collections = await db.listCollections().toArray();
    
    // Count documents in each collection
    const collectionCounts = {};
    for (const collection of collections) {
      try {
        collectionCounts[collection.name] = await db.collection(collection.name).countDocuments();
      } catch (err) {
        collectionCounts[collection.name] = `Error: ${err.message}`;
      }
    }
    
    res.json({
      status: "Connected",
      databaseName: db.databaseName,
      availableDatabases: databases.databases.map(db => db.name),
      collections: collections.map(c => c.name),
      collectionCounts,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_NAME: process.env.DATABASE_NAME,
        MONGODB_URI: process.env.MONGODB_URI ? "Set" : "Not set"
      }
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({
      error: "Database connection failed",
      details: error.message,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_NAME: process.env.DATABASE_NAME,
        MONGODB_URI: process.env.MONGODB_URI ? "Set" : "Not set"
      }
    });
  }
});

// Export the Express app for Vercel
export default app;