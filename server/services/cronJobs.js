/**
 * FEATURE 4: Auto-expire blood requests after 7 days
 * FEATURE 3: Smart donor re-engagement nudge after 56 days
 *
 * Run with setInterval on server start (no external cron lib needed)
 */
import BloodRequest from "../models/BloodRequest.js";
import DonorProfile from "../models/DonorProfile.js";
import User from "../models/User.js";
import { sendNotification } from "./notificationService.js";

// ── FEATURE 4: expire old open requests
export const expireOldRequests = async () => {
  try {
    const now = new Date();
    const expired = await BloodRequest.find({
      status: "open",
      expiresAt: { $lte: now },
    });

    for (const req of expired) {
      await BloodRequest.findByIdAndUpdate(req._id, { status: "expired" });

      // Notify requester
      await sendNotification({
        userId: req.requesterId,
        title: "⏰ Request expired",
        message: `Your blood request for ${req.patientName} (${req.bloodType}) at ${req.hospital} has expired after 7 days. Please post a new request if still needed.`,
        type: "alert",
        link: "/requests/new",
      });
    }

    if (expired.length > 0) {
      console.log(`[CRON] Expired ${expired.length} old blood requests`);
    }
  } catch (err) {
    console.error("[CRON] expireOldRequests error:", err.message);
  }
};

// ── FEATURE 3: Nudge eligible donors
export const reEngageDonors = async () => {
  try {
    const now = new Date();
    const eligibleDonors = await DonorProfile.find({
      nextEligibleDate: { $lte: now },
      reEngagementSent: false,
      isAvailable: false,
    }).populate("userId", "name email");

    for (const donor of eligibleDonors) {
      if (!donor.userId) continue;

      await sendNotification({
        userId: donor.userId._id,
        title: "🩸 You're eligible to donate again!",
        message: `Hi ${donor.userId.name}! It's been 56+ days since your last donation. You're now eligible to donate blood again. Turn on your availability and save a life today!`,
        type: "system",
        link: "/profile",
        email: donor.userId.email,
      });

      // Mark re-engagement as sent
      await DonorProfile.findByIdAndUpdate(donor._id, {
        reEngagementSent: true,
        isAvailable: true, // auto re-enable availability
      });
    }

    if (eligibleDonors.length > 0) {
      console.log(`[CRON] Re-engaged ${eligibleDonors.length} donors`);
    }
  } catch (err) {
    console.error("[CRON] reEngageDonors error:", err.message);
  }
};

// ── Start all cron jobs
export const startCronJobs = () => {
  // Run every hour
  const HOUR = 60 * 60 * 1000;

  expireOldRequests();     // run immediately on start
  reEngageDonors();

  setInterval(expireOldRequests, HOUR);
  setInterval(reEngageDonors, HOUR);

  console.log("[CRON] Jobs started: request expiry + donor re-engagement");
};
