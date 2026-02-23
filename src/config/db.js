const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI não definido no .env");

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri);
  console.log("[db] conectado");
}

module.exports = { connectDB };
