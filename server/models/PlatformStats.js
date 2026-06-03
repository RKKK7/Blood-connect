import mongoose from "mongoose";

const platformStatsSchema = new mongoose.Schema({
  date:           { type: String, required: true, unique: true }, // YYYY-MM-DD
  totalRequests:  { type: Number, default: 0 },
  fulfilledReqs:  { type: Number, default: 0 },
  totalDonations: { type: Number, default: 0 },
  criticalSaved:  { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model("PlatformStats", platformStatsSchema);
