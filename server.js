import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
let db;

(async () => {
  try {
    await client.connect();
    db = client.db(process.env.DATABASE_NAME);
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
})();

// ---------------- API Routes ----------------

// Get all players
app.get("/api/players", async (req, res) => {
  try {
    const players = await db.collection("Players").find({}).toArray();
    res.json(players);
  } catch (error) {
    console.error("Error fetching players:", error);
    res.status(500).json({ error: "Failed to fetch players" });
  }
});

// Get recent sessions
app.get("/api/sessions", async (req, res) => {
  try {
    const sessions = await db
      .collection("Sessions")
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json(sessions);
  } catch (error) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// Record a game
app.post("/api/game", async (req, res) => {
  try {
    const { playerName, result, amount, gameType } = req.body;

    if (!playerName || !result || !amount || !gameType) {
      return res.status(400).json({ error: "All fields are required" });
    }

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
    await updateLeaderboard();

    res.json({ success: true, message: "Game recorded successfully" });
  } catch (error) {
    console.error("Error recording game:", error);
    res.status(500).json({ error: "Failed to record game" });
  }
});

// Update leaderboard
async function updateLeaderboard() {
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

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
