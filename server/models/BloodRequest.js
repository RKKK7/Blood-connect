import mongoose from "mongoose";

const bloodRequestSchema = new mongoose.Schema({
  requesterId:     { type: mongoose.Schema.Types.ObjectId, ref:"User", required:true },
  patientName:     { type: String, required:true },
  bloodType:       { type: String, enum:["A+","A-","B+","B-","AB+","AB-","O+","O-"], required:true },
  units:           { type: Number, required:true, min:1 },
  hospital:        { type: String, required:true },
  city:            { type: String, required:true },
  location: {
    type:        { type: String, enum:["Point"], default:"Point" },
    coordinates: { type:[Number], default:[0,0] },
  },
  contactPhone:  { type: String, required:true },
  urgency:       { type: String, enum:["critical","urgent","normal"], default:"normal" },
  urgencyReason: { type: String, default:"" },
  status:        { type: String, enum:["open","fulfilled","cancelled","expired"], default:"open" },
  aiSummary:     { type: String, default:"" },
  notes:         { type: String, default:"" },
  respondedDonors:[{ type: mongoose.Schema.Types.ObjectId, ref:"User" }],
  fulfilledAt:   { type: Date, default:null },
  expiresAt:     { type: Date, default:null },
  sosSent:       { type: Boolean, default:false }, // Feature 3
}, { timestamps:true });

bloodRequestSchema.index({ location:"2dsphere" });
export default mongoose.model("BloodRequest", bloodRequestSchema);
