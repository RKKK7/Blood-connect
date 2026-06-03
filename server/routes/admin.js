import express from "express";
import User from "../models/User.js";
import DonorProfile from "../models/DonorProfile.js";
import BloodRequest from "../models/BloodRequest.js";
import Donation from "../models/Donation.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(protect, adminOnly);

router.get("/stats", async (req, res) => {
  try {
    const [totalUsers, totalDonors, totalRequests, openRequests, totalDonations, criticalRequests] =
      await Promise.all([
        User.countDocuments(),
        DonorProfile.countDocuments(),
        BloodRequest.countDocuments(),
        BloodRequest.countDocuments({ status:"open" }),
        Donation.countDocuments({ status:"completed" }),
        BloodRequest.countDocuments({ urgency:"critical", status:"open" }),
      ]);

    const bloodTypeBreakdown = await DonorProfile.aggregate([
      { $group:{ _id:"$bloodType", count:{ $sum:1 } } },
      { $sort:{ count:-1 } },
    ]);

    const recentRequests = await BloodRequest.find()
      .populate("requesterId","name").sort({ createdAt:-1 }).limit(10);

    res.json({ stats:{ totalUsers, totalDonors, totalRequests, openRequests, totalDonations, criticalRequests }, bloodTypeBreakdown, recentRequests });
  } catch (err) { res.status(500).json({ message:err.message }); }
});

// Feature 4: Bulk verify donors
router.post("/donors/bulk-verify", async (req, res) => {
  try {
    const { donorIds, isVerified } = req.body;
    if (!donorIds?.length) return res.status(400).json({ message:"No donor IDs provided" });
    const result = await DonorProfile.updateMany(
      { _id: { $in: donorIds } }, { isVerified }
    );
    res.json({ message:`${result.modifiedCount} donors ${isVerified?"verified":"unverified"}` });
  } catch (err) { res.status(500).json({ message:err.message }); }
});

// Feature 4: Bulk close stale requests
router.post("/requests/bulk-close", async (req, res) => {
  try {
    const { requestIds, status = "cancelled" } = req.body;
    if (!requestIds?.length) return res.status(400).json({ message:"No request IDs provided" });
    const result = await BloodRequest.updateMany(
      { _id: { $in: requestIds }, status:"open" }, { status }
    );
    res.json({ message:`${result.modifiedCount} requests closed` });
  } catch (err) { res.status(500).json({ message:err.message }); }
});

// Feature 4: Close all stale requests (open > 14 days)
router.post("/requests/close-stale", async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 14*24*60*60*1000);
    const result = await BloodRequest.updateMany(
      { status:"open", createdAt:{ $lte:cutoff } }, { status:"expired" }
    );
    res.json({ message:`${result.modifiedCount} stale requests closed` });
  } catch (err) { res.status(500).json({ message:err.message }); }
});

// Seed
router.post("/seed", async (req, res) => {
  try {
    await BloodRequest.deleteMany({});
    const users = await User.find({ role:"requester" }).limit(3);
    if (!users.length) return res.status(400).json({ message:"Create at least one requester account first" });

    const seedRequests = [
      { patientName:"Arjun Mehta",  bloodType:"O-",  units:2, hospital:"Apollo Hospital",  city:"Bengaluru", contactPhone:"9876543210", urgency:"critical", aiSummary:"O- blood urgently needed for cardiac surgery", urgencyReason:"Pre-surgical requirement", notes:"Cardiac surgery tomorrow morning" },
      { patientName:"Priya Sharma", bloodType:"AB+", units:1, hospital:"Manipal Hospital", city:"Bengaluru", contactPhone:"9123456780", urgency:"urgent",   aiSummary:"AB+ needed for accident victim",              urgencyReason:"Road accident trauma",         notes:"Road accident victim, stable" },
      { patientName:"Ravi Kumar",   bloodType:"B+",  units:3, hospital:"St. John's",       city:"Bengaluru", contactPhone:"9988776655", urgency:"normal",   aiSummary:"B+ needed for dialysis patient",             urgencyReason:"Routine procedure",            notes:"Chronic kidney disease" },
      { patientName:"Sunita Rao",   bloodType:"A+",  units:2, hospital:"Fortis Hospital",  city:"Mumbai",    contactPhone:"9871234560", urgency:"urgent",   aiSummary:"A+ needed for cancer patient",               urgencyReason:"Chemotherapy complications",    notes:"Leukemia, low platelet count" },
      { patientName:"Mohan Das",    bloodType:"O+",  units:1, hospital:"AIIMS",            city:"Delhi",     contactPhone:"9765432100", urgency:"normal",   aiSummary:"O+ needed for hip replacement",              urgencyReason:"Elective surgery",             notes:"Hip replacement next week" },
    ];

    const created = await BloodRequest.insertMany(
      seedRequests.map((r,i) => ({ ...r, requesterId:users[i%users.length]._id, status:"open",
        expiresAt: new Date(Date.now()+7*24*60*60*1000) }))
    );
    res.json({ message:`Seeded ${created.length} blood requests` });
  } catch (err) { res.status(500).json({ message:err.message }); }
});

export default router;
