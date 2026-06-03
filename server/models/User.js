import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  phone:    { type: String, default: "" },
  role:     { type: String, enum: ["donor","requester","admin"], default: "donor" },
  avatar:   { type: String, default: "" },
  // Feature 10: password reset
  resetPasswordToken:   { type: String, default: null },
  resetPasswordExpires: { type: Date,   default: null },
  // Feature 8: availability schedule
  availabilitySchedule: {
    enabled:   { type: Boolean, default: false },
    days:      [{ type: String }], // ['Mon','Tue',...]
    startTime: { type: String, default: "09:00" },
    endTime:   { type: String, default: "18:00" },
  },
  // Feature 7: rate limiting - track open requests
  openRequestCount: { type: Number, default: 0 },
}, { timestamps: true });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (pw) {
  return bcrypt.compare(pw, this.password);
};

userSchema.methods.createPasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString("hex");
  this.resetPasswordToken   = crypto.createHash("sha256").update(token).digest("hex");
  this.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 min
  return token; // send raw token in email, store hash
};

export default mongoose.model("User", userSchema);
