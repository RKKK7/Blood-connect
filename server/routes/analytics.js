import express from "express";
import BloodRequest from "../models/BloodRequest.js";
import Donation from "../models/Donation.js";
import DonorProfile from "../models/DonorProfile.js";
import User from "../models/User.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";
import { forecastDemand } from "../services/aiService.js";

const router = express.Router();

// Feature 6: PUBLIC platform stats (no auth)
router.get("/public", async (req, res) => {
  try {
    const [totalDonations, totalRequests, fulfilledRequests, totalDonors, activeCities] =
      await Promise.all([
        Donation.countDocuments({ status: "completed" }),
        BloodRequest.countDocuments(),
        BloodRequest.countDocuments({ status: "fulfilled" }),
        DonorProfile.countDocuments(),
        BloodRequest.distinct("city"),
      ]);

    const livesClaimed = totalDonations * 3;
    const fulfillmentRate = totalRequests > 0
      ? Math.round((fulfilledRequests / totalRequests) * 100) : 0;

    // Recent activity feed (last 5 completed donations)
    const recentDonations = await Donation.find({ status: "completed" })
      .populate("donorId", "name")
      .populate({ path: "requestId", select: "bloodType hospital city patientName" })
      .sort({ donatedAt: -1 }).limit(5);

    res.json({
      totalDonations, totalRequests, fulfilledRequests,
      totalDonors, activeCities: activeCities.filter(Boolean).length,
      livesClaimed, fulfillmentRate, recentDonations,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Feature 2: Admin analytics — requests over time + by type
router.get("/admin", protect, adminOnly, async (req, res) => {
  try {
    // Last 30 days daily breakdown
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const dailyRequests = await BloodRequest.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        total: { $sum: 1 },
        critical: { $sum: { $cond: [{ $eq: ["$urgency", "critical"] }, 1, 0] } },
        fulfilled: { $sum: { $cond: [{ $eq: ["$status", "fulfilled"] }, 1, 0] } },
      }},
      { $sort: { _id: 1 } },
    ]);

    // Fulfillment rate by blood type
    const byBloodType = await BloodRequest.aggregate([
      { $group: {
        _id: "$bloodType",
        total:     { $sum: 1 },
        fulfilled: { $sum: { $cond: [{ $eq: ["$status", "fulfilled"] }, 1, 0] } },
        critical:  { $sum: { $cond: [{ $eq: ["$urgency", "critical"] }, 1, 0] } },
      }},
      { $sort: { total: -1 } },
    ]);

    // Avg response time: createdAt → first pledge
    const donations = await Donation.find({ status: { $ne: "cancelled" } })
      .populate("requestId", "createdAt bloodType city");
    const responseTimes = donations
      .filter(d => d.requestId)
      .map(d => ({
        bloodType: d.requestId.bloodType,
        city:      d.requestId.city,
        hours:     Math.round((new Date(d.createdAt) - new Date(d.requestId.createdAt)) / (1000 * 60 * 60)),
      }))
      .filter(d => d.hours >= 0 && d.hours < 720);

    const avgResponseHours = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((s, d) => s + d.hours, 0) / responseTimes.length)
      : 0;

    // Top cities
    const topCities = await BloodRequest.aggregate([
      { $group: { _id: "$city", count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 8 },
    ]);

    // New users per week (last 4 weeks)
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const weeklyUsers = await User.aggregate([
      { $match: { createdAt: { $gte: fourWeeksAgo } } },
      { $group: {
        _id: { $week: "$createdAt" },
        count: { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]);

    res.json({ dailyRequests, byBloodType, avgResponseHours, topCities, weeklyUsers });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Feature 5: AI demand forecast
router.get("/forecast", protect, adminOnly, async (req, res) => {
  try {
    // Last 30 days requests by blood type + city
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const historicalData = await BloodRequest.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: {
        _id: { bloodType: "$bloodType", city: "$city" },
        count:     { $sum: 1 },
        critical:  { $sum: { $cond: [{ $eq: ["$urgency", "critical"] }, 1, 0] } },
        fulfilled: { $sum: { $cond: [{ $eq: ["$status", "fulfilled"] }, 1, 0] } },
      }},
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    const forecast = await forecastDemand(historicalData);
    res.json(forecast);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

export default router;
