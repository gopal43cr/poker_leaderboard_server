const { connectToDatabase } = require('../lib/mongodb.js');

module.exports = async function handler(req, res) {
  console.log('🎯 Players API called:', req.method);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Connecting to database...');
    const db = await connectToDatabase();
    
    console.log('📊 Fetching players...');
    const players = await db.collection("Players").find({}).toArray();
    
    console.log(`✅ Found ${players.length} players`);
    res.status(200).json(players);
  } catch (error) {
    console.error("❌ Error fetching players:", error);
    res.status(500).json({ 
      error: "Failed to fetch players",
      details: error.message 
    });
  }
};