import express from "express";
import BloodRequest from "../models/BloodRequest.js";
import DonorProfile from "../models/DonorProfile.js";
import { scoreDonorMatch } from "../services/aiService.js";

const router = express.Router();

const compatibleDonors = (bloodType) => {
  const compatibility = {
    "A+": ["A+", "A-", "O+", "O-"], "A-": ["A-", "O-"],
    "B+": ["B+", "B-", "O+", "O-"], "B-": ["B-", "O-"],
    "AB+": ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    "AB-": ["A-", "B-", "AB-", "O-"],
    "O+": ["O+", "O-"], "O-": ["O-"],
  };
  return compatibility[bloodType] || [bloodType];
};

router.get("/:requestId", async (req, res) => {
  try {
    const request = await BloodRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });

    const compatTypes = compatibleDonors(request.bloodType);
    const donors = await DonorProfile.find({
      bloodType: { $in: compatTypes },
      isAvailable: true,
    }).populate("userId", "name phone city").limit(20);

    const scored = await Promise.all(
      donors.map(async (donor) => {
        const aiScore = await scoreDonorMatch(donor, request);
        return { donor, aiScore };
      })
    );

    scored.sort((a, b) => b.aiScore.score - a.aiScore.score);
    res.json(scored);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
