import express from "express";
import DonorProfile from "../models/DonorProfile.js";
import User from "../models/User.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";
import { generateHealthTip } from "../services/aiService.js";

const router = express.Router();

router.get("/nearby", async (req, res) => {
  try {
    const { lng, lat, radius = 50, bloodType } = req.query;
    const filter = { isAvailable: true };
    if (bloodType) filter.bloodType = bloodType;
    let donors;
    if (lng && lat) {
      filter.location = {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseFloat(radius) * 1000,
        },
      };
      donors = await DonorProfile.find(filter).populate("userId", "name phone email").limit(50);
    } else {
      donors = await DonorProfile.find(filter).populate("userId", "name phone email").limit(50);
    }
    res.json(donors);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/leaderboard", async (req, res) => {
  try {
    const donors = await DonorProfile.find({ totalDonations: { $gt: 0 } })
      .sort({ totalDonations: -1 }).limit(20).populate("userId", "name");
    res.json(donors);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/profile", protect, async (req, res) => {
  try {
    const profile = await DonorProfile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ message: "Donor profile not found" });
    res.json(profile);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put("/profile", protect, async (req, res) => {
  try {
    const { bloodType, city, state, isAvailable, weight, age, medicalNotes, coordinates } = req.body;
    const update = { bloodType, city, state, isAvailable, weight, age, medicalNotes };
    if (coordinates) update.location = { type: "Point", coordinates };
    const profile = await DonorProfile.findOneAndUpdate(
      { userId: req.user._id }, update, { new: true, upsert: true }
    );
    res.json(profile);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// FEATURE 7: AI health tip
router.get("/health-tip", protect, async (req, res) => {
  try {
    const profile = await DonorProfile.findOne({ userId: req.user._id });
    if (!profile) return res.status(404).json({ message: "Donor profile not found" });
    const tip = await generateHealthTip(profile);
    res.json(tip);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/all", protect, adminOnly, async (req, res) => {
  try {
    const donors = await DonorProfile.find().populate("userId", "name email phone").sort({ createdAt: -1 });
    res.json(donors);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put("/:id/verify", protect, adminOnly, async (req, res) => {
  try {
    const profile = await DonorProfile.findByIdAndUpdate(req.params.id, { isVerified: req.body.isVerified }, { new: true });
    res.json(profile);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

export default router;
