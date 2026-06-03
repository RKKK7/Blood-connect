import mongoose from "mongoose";

const donorProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  bloodType: { type: String, enum: ["A+","A-","B+","B-","AB+","AB-","O+","O-"], required: true },
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: [0, 0] },
  },
  city: { type: String, default: "" },
  state: { type: String, default: "" },
  isAvailable: { type: Boolean, default: true },
  lastDonated: { type: Date, default: null },
  totalDonations: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  healthScore: { type: Number, default: 100, min: 0, max: 100 },
  weight: { type: Number, default: 0 },
  age: { type: Number, default: 0 },
  medicalNotes: { type: String, default: "" },
  badges: [{ type: String }],
  // FEATURE 3: re-engagement fields
  nextEligibleDate: { type: Date, default: null },
  reEngagementSent: { type: Boolean, default: false },
}, { timestamps: true });

donorProfileSchema.index({ location: "2dsphere" });

export default mongoose.model("DonorProfile", donorProfileSchema);
