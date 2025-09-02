export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).send("✅ Poker Leaderboard API is running!");
}