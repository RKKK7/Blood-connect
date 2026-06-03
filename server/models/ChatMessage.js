import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema({
  donationId: { type: mongoose.Schema.Types.ObjectId, ref: "Donation",    required: true },
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: "User",        required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User",        required: true },
  message:    { type: String, required: true, maxlength: 500 },
  isRead:     { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model("ChatMessage", chatMessageSchema);
