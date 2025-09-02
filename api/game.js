const { connectToDatabase, updateLeaderboard } = require('../lib/mongodb.js');

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { playerName, result, amount, gameType } = req.body;

    if (!playerName || !result || !amount || !gameType) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const db = await connectToDatabase();
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

    res.status(200).json({ success: true, message: "Game recorded successfully" });
  } catch (error) {
    console.error("Error recording game:", error);
    res.status(500).json({ error: "Failed to record game" });
  }
};