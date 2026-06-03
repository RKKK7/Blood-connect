/**
 * FEATURE 6: Blood Shortage Dashboard
 * Public endpoint — no login needed
 * Shows blood type availability per city (red/yellow/green)
 */
import express from "express";
import DonorProfile from "../models/DonorProfile.js";
import BloodRequest from "../models/BloodRequest.js";

const router = express.Router();

// GET /api/shortage
// Returns per-city, per-blood-type shortage level
router.get("/", async (req, res) => {
  try {
    // Count available donors per blood type per city
    const donorAgg = await DonorProfile.aggregate([
      { $match: { isAvailable: true } },
      {
        $group: {
          _id: { city: "$city", bloodType: "$bloodType" },
          donors: { $sum: 1 },
        },
      },
    ]);

    // Count open requests per blood type per city
    const requestAgg = await BloodRequest.aggregate([
      { $match: { status: "open" } },
      {
        $group: {
          _id: { city: "$city", bloodType: "$bloodType" },
          requests: { $sum: 1 },
        },
      },
    ]);

    // Merge into a city → bloodType → { donors, requests, level } map
    const cityMap = {};

    for (const d of donorAgg) {
      const { city, bloodType } = d._id;
      if (!city) continue;
      if (!cityMap[city]) cityMap[city] = {};
      if (!cityMap[city][bloodType]) cityMap[city][bloodType] = { donors: 0, requests: 0 };
      cityMap[city][bloodType].donors = d.donors;
    }

    for (const r of requestAgg) {
      const { city, bloodType } = r._id;
      if (!city) continue;
      if (!cityMap[city]) cityMap[city] = {};
      if (!cityMap[city][bloodType]) cityMap[city][bloodType] = { donors: 0, requests: 0 };
      cityMap[city][bloodType].requests = r.requests;
    }

    // Compute shortage level
    const BLOOD_TYPES = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
    const result = [];

    for (const [city, types] of Object.entries(cityMap)) {
      const bloodTypes = {};
      for (const bt of BLOOD_TYPES) {
        const { donors = 0, requests = 0 } = types[bt] || {};
        let level = "green";
        if (requests > 0 && donors === 0) level = "red";
        else if (requests > 0 && donors <= requests) level = "yellow";
        bloodTypes[bt] = { donors, requests, level };
      }
      result.push({ city, bloodTypes });
    }

    result.sort((a, b) => a.city.localeCompare(b.city));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
