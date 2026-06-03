import mongoose from "mongoose";

const donationSchema = new mongoose.Schema({
  donorId:   { type: mongoose.Schema.Types.ObjectId, ref: "User",        required: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: "BloodRequest",required: true },
  status:    { type: String, enum: ["pledged","confirmed","completed","cancelled"], default: "pledged" },
  donatedAt: { type: Date, default: null },
  notes:     { type: String, default: "" },
  // Feature 9: post-donation feedback
  feedback: {
    rating:    { type: Number, min: 1, max: 5, default: null },
    onTime:    { type: Boolean, default: null },
    comment:   { type: String, default: "" },
    submittedAt: { type: Date, default: null },
  },
}, { timestamps: true });

export default mongoose.model("Donation", donationSchema);
