import express from "express";
import jwt from "jsonwebtoken";
import Donation from "../models/Donation.js";
import DonorProfile from "../models/DonorProfile.js";
import User from "../models/User.js";

const router = express.Router();

// GET /api/certificate/:donationId?token=<jwt>
// Token passed as query param so it works when opened directly in a browser tab
router.get("/:donationId", async (req, res) => {
  try {
    // Authenticate via query param token
    const token = req.query.token;
    if (!token) return res.status(401).json({ message: "No token provided. Add ?token=YOUR_JWT to the URL." });

    let currentUser;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      currentUser = await User.findById(decoded.id).select("-password");
      if (!currentUser) return res.status(401).json({ message: "User not found" });
    } catch {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const donation = await Donation.findById(req.params.donationId)
      .populate("donorId", "name email")
      .populate("requestId");

    if (!donation) return res.status(404).json({ message: "Donation not found" });
    if (donation.status !== "completed")
      return res.status(400).json({ message: "Certificate only available for completed donations" });

    // Only the donor themselves or admin can get the certificate
    if (
      donation.donorId._id.toString() !== currentUser._id.toString() &&
      currentUser.role !== "admin"
    ) return res.status(403).json({ message: "Not authorized" });

    const donorProfile = await DonorProfile.findOne({ userId: donation.donorId._id });
    const request      = donation.requestId;
    const donorName    = donation.donorId.name;
    const donatedDate  = donation.donatedAt
      ? new Date(donation.donatedAt).toLocaleDateString("en-IN", { year:"numeric", month:"long", day:"numeric" })
      : new Date().toLocaleDateString("en-IN", { year:"numeric", month:"long", day:"numeric" });
    const certId = `BC-${donation._id.toString().slice(-8).toUpperCase()}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>BloodConnect — Donation Certificate</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',sans-serif; background:#f9f9f9; display:flex; justify-content:center; align-items:center; min-height:100vh; padding:40px 20px; }
    .cert { background:#fff; width:720px; padding:60px; border:3px solid #e53e3e; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,0.1); position:relative; overflow:hidden; }
    .cert::before { content:''; position:absolute; top:10px; left:10px; right:10px; bottom:10px; border:1px solid rgba(229,62,62,0.2); border-radius:12px; pointer-events:none; }
    .watermark { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-30deg); font-size:120px; color:rgba(229,62,62,0.04); font-weight:700; white-space:nowrap; pointer-events:none; }
    .logo { display:flex; align-items:center; gap:10px; margin-bottom:32px; }
    .logo-icon { width:44px; height:44px; background:#e53e3e; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:22px; }
    .logo-text { font-family:'Playfair Display',serif; font-size:22px; color:#e53e3e; font-weight:700; }
    .title { text-align:center; margin-bottom:28px; }
    .title h1 { font-family:'Playfair Display',serif; font-size:36px; color:#1a1a1a; margin-bottom:8px; }
    .title p { color:#888; font-size:14px; letter-spacing:2px; text-transform:uppercase; }
    .divider { border:none; border-top:2px solid #e53e3e; width:80px; display:block; margin:16px auto 28px; }
    .body-text { text-align:center; color:#555; font-size:15px; line-height:1.8; margin-bottom:32px; }
    .donor-name { font-family:'Playfair Display',serif; font-size:36px; color:#e53e3e; text-align:center; margin:24px 0; padding:16px; border-top:1px dashed #e5e5e5; border-bottom:1px dashed #e5e5e5; }
    .details { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:32px 0; }
    .detail-box { background:#fff5f5; border:1px solid rgba(229,62,62,0.15); border-radius:10px; padding:14px 18px; }
    .detail-label { font-size:11px; color:#999; font-weight:600; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px; }
    .detail-value { font-size:15px; color:#1a1a1a; font-weight:600; }
    .footer { display:flex; justify-content:space-between; align-items:flex-end; margin-top:40px; border-top:1px solid #e5e5e5; padding-top:24px; }
    .cert-id { font-size:11px; color:#bbb; letter-spacing:1px; }
    .sig-line { border-top:1px solid #ccc; width:160px; margin:0 auto 6px; }
    .sig-text { font-size:12px; color:#888; text-align:center; }
    .badge-row { display:flex; justify-content:center; gap:10px; margin:20px 0; flex-wrap:wrap; }
    .badge { background:#fff5f5; border:1px solid rgba(229,62,62,0.2); border-radius:100px; padding:4px 14px; font-size:12px; color:#e53e3e; font-weight:600; }
    .print-btn { position:fixed; bottom:24px; right:24px; background:#e53e3e; color:#fff; border:none; padding:12px 24px; border-radius:10px; font-size:15px; font-weight:600; cursor:pointer; box-shadow:0 4px 16px rgba(229,62,62,0.4); }
    @media print { body { background:white; } .cert { box-shadow:none; } .print-btn { display:none; } }
  </style>
</head>
<body>
  <div class="cert">
    <div class="watermark">🩸</div>
    <div class="logo">
      <div class="logo-icon">🩸</div>
      <span class="logo-text">BloodConnect</span>
    </div>
    <div class="title">
      <h1>Certificate of Donation</h1>
      <p>Blood Donation Achievement</p>
    </div>
    <hr class="divider" />
    <p class="body-text">This is to certify that</p>
    <div class="donor-name">${donorName}</div>
    <p class="body-text">
      has heroically donated <strong>${request?.bloodType || donorProfile?.bloodType || "blood"}</strong>
      blood on <strong>${donatedDate}</strong> at <strong>${request?.hospital || "the hospital"}</strong>,
      <strong>${request?.city || ""}</strong>, contributing to the care of
      <strong>${request?.patientName || "a patient in need"}</strong>.<br /><br />
      This selfless act can save up to <strong>3 lives</strong>.
    </p>
    ${donorProfile?.badges?.length ? `
    <div class="badge-row">
      ${donorProfile.badges.map(b => `<span class="badge">${b}</span>`).join("")}
    </div>` : ""}
    <div class="details">
      <div class="detail-box">
        <p class="detail-label">Blood Type Donated</p>
        <p class="detail-value">${request?.bloodType || donorProfile?.bloodType || "—"}</p>
      </div>
      <div class="detail-box">
        <p class="detail-label">Date of Donation</p>
        <p class="detail-value">${donatedDate}</p>
      </div>
      <div class="detail-box">
        <p class="detail-label">Hospital</p>
        <p class="detail-value">${request?.hospital || "—"}</p>
      </div>
      <div class="detail-box">
        <p class="detail-label">Total Donations</p>
        <p class="detail-value">${donorProfile?.totalDonations || 1}</p>
      </div>
    </div>
    <div class="footer">
      <div class="cert-id">Certificate ID: ${certId}</div>
      <div>
        <div class="sig-line"></div>
        <p class="sig-text">BloodConnect Platform</p>
        <p class="sig-text" style="color:#bbb;font-size:10px;">AI-Powered Blood Donation Network</p>
      </div>
    </div>
  </div>

  <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
