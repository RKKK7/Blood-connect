import express from "express";
import ChatMessage from "../models/ChatMessage.js";
import Donation from "../models/Donation.js";
import { protect } from "../middleware/authMiddleware.js";
import { io } from "../index.js";

const router = express.Router();

const verifyAccess = async (donationId, userId) => {
  const donation = await Donation.findById(donationId).populate("requestId");
  if (!donation) return null;
  const isDonor     = donation.donorId.toString()                     === userId.toString();
  const isRequester = donation.requestId.requesterId.toString()       === userId.toString();
  return (isDonor || isRequester) ? donation : null;
};

// GET messages
router.get("/:donationId", protect, async (req, res) => {
  try {
    const donation = await verifyAccess(req.params.donationId, req.user._id);
    if (!donation) return res.status(403).json({ message: "Not authorized" });

    const messages = await ChatMessage.find({ donationId: req.params.donationId })
      .populate("senderId", "name")
      .sort({ createdAt: 1 }).limit(100);

    await ChatMessage.updateMany(
      { donationId: req.params.donationId, receiverId: req.user._id, isRead: false },
      { isRead: true }
    );

    res.json({ messages, donation });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST message
router.post("/:donationId", protect, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: "Empty message" });

    const donation = await verifyAccess(req.params.donationId, req.user._id);
    if (!donation) return res.status(403).json({ message: "Not authorized" });

    const receiverId = donation.donorId.toString() === req.user._id.toString()
      ? donation.requestId.requesterId
      : donation.donorId;

    const saved = await ChatMessage.create({
      donationId: req.params.donationId,
      senderId:   req.user._id,
      receiverId,
      message:    message.trim().substring(0, 500),
    });

    const populated = await ChatMessage.findById(saved._id).populate("senderId", "name");

    // Real-time delivery
    io.to(`chat_${req.params.donationId}`).emit("chat_message", populated);
    io.to(receiverId.toString()).emit("chat_notification", {
      donationId: req.params.donationId,
      from: req.user.name,
      preview: message.substring(0, 60),
    });

    res.status(201).json(populated);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Unread count
router.get("/:donationId/unread", protect, async (req, res) => {
  try {
    const count = await ChatMessage.countDocuments({
      donationId: req.params.donationId, receiverId: req.user._id, isRead: false,
    });
    res.json({ count });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

export default router;
