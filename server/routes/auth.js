import express from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";
import DonorProfile from "../models/DonorProfile.js";
import { protect } from "../middleware/authMiddleware.js";
import nodemailer from "nodemailer";

const router = express.Router();
const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// Register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone, role, bloodType, city, adminSecret } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields required" });

    if (await User.findOne({ email }))
      return res.status(409).json({ message: "Email already registered" });

    if (role === "admin") {
      const secret = process.env.ADMIN_SECRET || "bloodconnect_admin_2024";
      if (adminSecret !== secret)
        return res.status(403).json({ message: "Invalid admin secret code" });
    }

    const user = await User.create({ name, email, password, phone: phone || "", role: role || "donor" });

    if (role === "donor" && bloodType)
      await DonorProfile.create({ userId: user._id, bloodType, city: city || "" });

    const token = signToken(user._id);
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: "Invalid credentials" });

    const token = signToken(user._id);
    const donorProfile = user.role === "donor"
      ? await DonorProfile.findOne({ userId: user._id }) : null;
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone }, donorProfile });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Me
router.get("/me", protect, async (req, res) => {
  try {
    const donorProfile = req.user.role === "donor"
      ? await DonorProfile.findOne({ userId: req.user._id }) : null;
    res.json({ user: req.user, donorProfile });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// FEATURE 10: Forgot password — send reset email
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    // Always respond 200 to avoid email enumeration
    if (!user) return res.json({ message: "If that email exists, a reset link has been sent." });

    const rawToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/reset-password/${rawToken}`;

    await mailer.sendMail({
      from: `"BloodConnect" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "BloodConnect — Password Reset",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#e53e3e">🩸 BloodConnect</h2>
          <h3>Reset your password</h3>
          <p>Hi ${user.name},</p>
          <p>Click below to reset your password. This link expires in <strong>30 minutes</strong>.</p>
          <a href="${resetUrl}" style="display:inline-block;margin:16px 0;background:#e53e3e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
            Reset Password
          </a>
          <p style="color:#888;font-size:12px">If you didn't request this, ignore this email.</p>
        </div>`,
    }).catch(e => console.error("Reset email error:", e.message));

    res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// FEATURE 10: Reset password with token
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters" });

    const hashed = crypto.createHash("sha256").update(req.params.token).digest("hex");
    const user = await User.findOne({
      resetPasswordToken: hashed,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ message: "Token is invalid or has expired" });

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    const token = signToken(user._id);
    res.json({ message: "Password reset successful", token });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// FEATURE 8: Update availability schedule
router.put("/availability-schedule", protect, async (req, res) => {
  try {
    const { enabled, days, startTime, endTime } = req.body;
    await User.findByIdAndUpdate(req.user._id, {
      availabilitySchedule: { enabled, days: days || [], startTime, endTime },
    });

    // Also update donor isAvailable based on schedule
    if (req.user.role === "donor") {
      const now = new Date();
      const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const todayName = dayNames[now.getDay()];
      const currentTime = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
      const isAvailable = !enabled || (
        days.includes(todayName) &&
        currentTime >= (startTime || "09:00") &&
        currentTime <= (endTime || "18:00")
      );
      await DonorProfile.findOneAndUpdate({ userId: req.user._id }, { isAvailable });
    }

    res.json({ message: "Schedule updated" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

export default router;
