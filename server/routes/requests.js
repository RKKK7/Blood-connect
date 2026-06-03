import express from "express";
import BloodRequest from "../models/BloodRequest.js";
import DonorProfile from "../models/DonorProfile.js";
import Donation from "../models/Donation.js";
import User from "../models/User.js";
import { protect } from "../middleware/authMiddleware.js";
import { classifyUrgency } from "../services/aiService.js";
import { sendNotification, broadcastRequest } from "../services/notificationService.js";
import { io } from "../index.js";

const router = express.Router();

const getCompatibleTypes = (bt) => ({
  "A+":["A+","A-","O+","O-"],"A-":["A-","O-"],
  "B+":["B+","B-","O+","O-"],"B-":["B-","O-"],
  "AB+":["A+","A-","B+","B-","AB+","AB-","O+","O-"],"AB-":["A-","B-","AB-","O-"],
  "O+":["O+","O-"],"O-":["O-"],
})[bt] || [bt];

const checkEligibility = (p) => {
  const issues = [];
  if (p.weight && p.weight < 50) issues.push("Weight must be at least 50 kg.");
  if (p.age && (p.age < 18 || p.age > 65)) issues.push("Donors must be aged 18–65.");
  if (p.lastDonated) {
    const d = Math.floor((Date.now()-new Date(p.lastDonated))/(1000*60*60*24));
    if (d < 56) issues.push(`Wait ${56-d} more days (56-day rule).`);
  }
  return { eligible: issues.length === 0, issues };
};

const awardBadges = async (profile) => {
  const badges = new Set(profile.badges || []);
  const t = profile.totalDonations;
  if (t>=1)  badges.add("First Drop 🩸");
  if (t>=5)  badges.add("Life Saver 💪");
  if (t>=10) badges.add("Blood Hero 🦸");
  if (t>=25) badges.add("Legend 🏆");
  const arr = Array.from(badges);
  await DonorProfile.findByIdAndUpdate(profile._id, { badges: arr });
  return arr;
};

// POST /api/requests — create with rate limit (Feature 7)
router.post("/", protect, async (req, res) => {
  try {
    const { patientName, bloodType, units, hospital, city, contactPhone, notes, coordinates } = req.body;
    if (!patientName || !bloodType || !units || !hospital || !city || !contactPhone)
      return res.status(400).json({ message: "All fields required" });

    // Feature 7: rate limit — max 3 open requests per user
    const openCount = await BloodRequest.countDocuments({
      requesterId: req.user._id, status: "open",
    });
    if (openCount >= 3)
      return res.status(429).json({ message: "You already have 3 open requests. Please close one before posting another." });

    const aiResult = await classifyUrgency({ patientName, bloodType, units, hospital, notes });
    const expiresAt = new Date(Date.now() + 7*24*60*60*1000);

    const request = await BloodRequest.create({
      requesterId: req.user._id, patientName, bloodType, units,
      hospital, city, contactPhone, notes: notes || "",
      urgency: aiResult.urgency, urgencyReason: aiResult.reason,
      aiSummary: aiResult.summary, expiresAt,
      location: coordinates ? { type:"Point", coordinates } : undefined,
    });

    const populated = await BloodRequest.findById(request._id).populate("requesterId","name");
    broadcastRequest(populated);

    const nearbyDonors = await DonorProfile.find({
      bloodType: { $in: getCompatibleTypes(bloodType) }, isAvailable: true,
    }).populate("userId","name email");

    for (const donor of nearbyDonors.slice(0,10)) {
      if (donor.userId) await sendNotification({
        userId: donor.userId._id,
        title: `${aiResult.urgency==="critical"?"🚨 CRITICAL":"🩸 New"} Blood Request`,
        message: `${bloodType} blood needed at ${hospital}, ${city}. ${aiResult.summary}`,
        type:"match", link:`/requests/${request._id}`,
        email: aiResult.urgency==="critical" ? donor.userId.email : null,
      });
    }
    res.status(201).json({ request: populated, aiResult });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/requests
router.get("/", async (req, res) => {
  try {
    const { status="open", bloodType, urgency, city, search, page=1, limit=10 } = req.query;
    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (bloodType) filter.bloodType = bloodType;
    if (urgency)   filter.urgency = urgency;
    if (city)      filter.city = { $regex: city, $options:"i" };
    if (search)    filter.$or = [
      { patientName: { $regex: search, $options:"i" } },
      { hospital:    { $regex: search, $options:"i" } },
      { city:        { $regex: search, $options:"i" } },
    ];
    const total = await BloodRequest.countDocuments(filter);
    const requests = await BloodRequest.find(filter)
      .populate("requesterId","name")
      .sort({ urgency:-1, createdAt:-1 })
      .skip((page-1)*limit).limit(parseInt(limit));
    res.json({ requests, total, pages: Math.ceil(total/limit), page: parseInt(page) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/my/requests", protect, async (req, res) => {
  try {
    const requests = await BloodRequest.find({ requesterId: req.user._id }).sort({ createdAt:-1 });
    res.json(requests);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/eligibility/check", protect, async (req, res) => {
  try {
    const p = await DonorProfile.findOne({ userId: req.user._id });
    if (!p) return res.status(404).json({ message:"Donor profile not found" });
    const { eligible, issues } = checkEligibility(p);
    const daysSince = p.lastDonated
      ? Math.floor((Date.now()-new Date(p.lastDonated))/(1000*60*60*24)) : null;
    res.json({ eligible, issues, daysSince, nextEligibleDate: p.nextEligibleDate });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Feature 3: SOS Broadcast — notify ALL compatible donors
router.post("/:id/sos", protect, async (req, res) => {
  try {
    const request = await BloodRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message:"Request not found" });
    if (request.requesterId.toString() !== req.user._id.toString() && req.user.role !== "admin")
      return res.status(403).json({ message:"Not authorized" });
    if (request.status !== "open")
      return res.status(400).json({ message:"Request must be open to send SOS" });

    // Prevent spam: SOS can only be sent once per request
    if (request.sosSent)
      return res.status(400).json({ message:"SOS already sent for this request" });

    await BloodRequest.findByIdAndUpdate(req.params.id, { sosSent: true, urgency:"critical" });

    // Notify ALL compatible donors, not just top 10
    const allDonors = await DonorProfile.find({
      bloodType: { $in: getCompatibleTypes(request.bloodType) },
      isAvailable: true,
    }).populate("userId","name email");

    let notified = 0;
    for (const donor of allDonors) {
      if (donor.userId) {
        await sendNotification({
          userId: donor.userId._id,
          title: "🚨 EMERGENCY SOS — Blood Needed NOW",
          message: `URGENT: ${request.bloodType} blood critically needed at ${request.hospital}, ${request.city} for ${request.patientName}. Please respond immediately!`,
          type:"alert", link:`/requests/${request._id}`,
          email: donor.userId.email, // email everyone for SOS
        });
        notified++;
      }
    }

    // Broadcast live alert
    io.emit("sos_request", { ...request.toObject(), urgency:"critical" });

    res.json({ message:`SOS sent to ${notified} compatible donors`, notified });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Lifecycle: confirm
router.put("/donations/:donationId/confirm", protect, async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.donationId).populate("requestId");
    if (!donation) return res.status(404).json({ message:"Donation not found" });
    if (donation.requestId.requesterId.toString() !== req.user._id.toString())
      return res.status(403).json({ message:"Only requester can confirm" });
    const updated = await Donation.findByIdAndUpdate(
      req.params.donationId, { status:"confirmed" }, { new:true }
    ).populate("donorId","name");
    await sendNotification({
      userId: donation.donorId,
      title:"✅ Appointment confirmed!",
      message:`Please proceed to ${donation.requestId.hospital} to donate ${donation.requestId.bloodType} blood.`,
      type:"donation", link:`/requests/${donation.requestId._id}`,
    });
    res.json(updated);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Lifecycle: complete + badges
router.put("/donations/:donationId/complete", protect, async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.donationId).populate("requestId");
    if (!donation) return res.status(404).json({ message:"Donation not found" });
    const request = donation.requestId;
    if (request.requesterId.toString()!==req.user._id.toString() && req.user.role!=="admin")
      return res.status(403).json({ message:"Not authorized" });

    const updated = await Donation.findByIdAndUpdate(
      req.params.donationId, { status:"completed", donatedAt:new Date() }, { new:true }
    ).populate("donorId","name");

    const donorProfile = await DonorProfile.findOneAndUpdate(
      { userId: donation.donorId },
      { $inc:{totalDonations:1}, lastDonated:new Date(), isAvailable:false,
        nextEligibleDate: new Date(Date.now()+56*24*60*60*1000), reEngagementSent:false },
      { new:true }
    );

    const newBadges = await awardBadges(donorProfile);
    await sendNotification({
      userId: donation.donorId,
      title:"🎉 Donation complete — you're a hero!",
      message:`Recorded: ${request.bloodType} at ${request.hospital}. Total: ${donorProfile.totalDonations}. Badges: ${newBadges.join(", ")}`,
      type:"donation", link:`/profile`,
    });

    // Feature 9: trigger feedback request to requester
    await sendNotification({
      userId: request.requesterId,
      title:"⭐ Rate your donor",
      message:`${updated.donorId?.name} completed their donation for ${request.patientName}. Please take a moment to rate your experience.`,
      type:"system", link:`/requests/${request._id}`,
    });

    res.json({ donation: updated, newBadges });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Feature 9: Submit feedback
router.post("/donations/:donationId/feedback", protect, async (req, res) => {
  try {
    const { rating, onTime, comment } = req.body;
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ message:"Rating must be 1–5" });

    const donation = await Donation.findById(req.params.donationId).populate("requestId");
    if (!donation) return res.status(404).json({ message:"Donation not found" });
    if (donation.requestId.requesterId.toString() !== req.user._id.toString())
      return res.status(403).json({ message:"Only requester can submit feedback" });
    if (donation.status !== "completed")
      return res.status(400).json({ message:"Can only rate completed donations" });
    if (donation.feedback?.rating)
      return res.status(409).json({ message:"Feedback already submitted" });

    const updated = await Donation.findByIdAndUpdate(
      req.params.donationId,
      { feedback: { rating, onTime: onTime ?? null, comment: comment || "", submittedAt: new Date() } },
      { new:true }
    );

    // Update donor health score based on feedback
    const scoreAdjust = rating >= 4 ? 2 : rating <= 2 ? -5 : 0;
    if (scoreAdjust !== 0) {
      await DonorProfile.findOneAndUpdate(
        { userId: donation.donorId },
        { $inc: { healthScore: scoreAdjust } }
      );
    }

    res.json(updated);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Feature 4: Donation history for a donor
router.get("/donor/history", protect, async (req, res) => {
  try {
    const donations = await Donation.find({ donorId: req.user._id })
      .populate({ path:"requestId", select:"bloodType hospital city patientName urgency createdAt" })
      .sort({ createdAt:-1 });
    res.json(donations);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /:id
router.get("/:id", async (req, res) => {
  try {
    const request = await BloodRequest.findById(req.params.id).populate("requesterId","name phone email");
    if (!request) return res.status(404).json({ message:"Request not found" });
    const donations = await Donation.find({ requestId: req.params.id }).populate("donorId","name");
    res.json({ request, donations });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /:id/respond
router.post("/:id/respond", protect, async (req, res) => {
  try {
    const request = await BloodRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message:"Request not found" });
    if (request.status !== "open") return res.status(400).json({ message:"Request not open" });

    const dp = await DonorProfile.findOne({ userId: req.user._id });
    if (dp) {
      const { eligible, issues } = checkEligibility(dp);
      if (!eligible) return res.status(400).json({ message:"Not eligible", eligibilityIssues:issues, notEligible:true });
    }

    const existing = await Donation.findOne({ donorId:req.user._id, requestId:req.params.id });
    if (existing) return res.status(409).json({ message:"Already responded" });

    const donation = await Donation.create({ donorId:req.user._id, requestId:req.params.id, status:"pledged" });
    await BloodRequest.findByIdAndUpdate(req.params.id, { $addToSet:{ respondedDonors:req.user._id } });

    const requester = await User.findById(request.requesterId);
    await sendNotification({
      userId: request.requesterId,
      title:"Donor responded!",
      message:`${req.user.name} pledged ${request.bloodType} blood for ${request.patientName}.`,
      type:"donation", link:`/requests/${request._id}`, email:requester?.email,
    });
    res.status(201).json(donation);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /:id/status
router.put("/:id/status", protect, async (req, res) => {
  try {
    const request = await BloodRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message:"Request not found" });
    if (request.requesterId.toString()!==req.user._id.toString() && req.user.role!=="admin")
      return res.status(403).json({ message:"Not authorized" });
    const update = { status:req.body.status };
    if (req.body.status==="fulfilled") update.fulfilledAt = new Date();
    const updated = await BloodRequest.findByIdAndUpdate(req.params.id, update, { new:true });
    res.json(updated);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

export default router;
