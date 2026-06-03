import Groq from "groq-sdk";
import dotenv from "dotenv";
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const chat = async (prompt, systemPrompt = "You are a helpful medical assistant AI. Always respond with valid JSON only.") => {
  const res = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 500,
  });
  return res.choices[0].message.content.trim();
};

export const classifyUrgency = async (requestData) => {
  try {
    const prompt = `Analyze this blood donation request and classify its urgency. Return ONLY valid JSON, no markdown.

Patient: ${requestData.patientName}
Blood type needed: ${requestData.bloodType}
Units needed: ${requestData.units}
Hospital: ${requestData.hospital}
Notes: ${requestData.notes || "None"}

Return:
{
  "urgency": "critical" | "urgent" | "normal",
  "reason": "one sentence explanation",
  "summary": "one engaging sentence for the live feed"
}`;

    const text = await chat(prompt);
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Groq urgency error:", err.message);
    return { urgency: "normal", reason: "AI classification unavailable", summary: `${requestData.bloodType} blood needed at ${requestData.hospital}` };
  }
};

export const scoreDonorMatch = async (donor, request) => {
  try {
    const daysSinceLastDonation = donor.lastDonated
      ? Math.floor((Date.now() - new Date(donor.lastDonated)) / (1000 * 60 * 60 * 24))
      : 999;

    const prompt = `Score this blood donor's compatibility for a request. Return ONLY valid JSON, no markdown.

Request: ${request.bloodType} blood, ${request.urgency} urgency
Donor blood type: ${donor.bloodType}
Donor health score: ${donor.healthScore}/100
Days since last donation: ${daysSinceLastDonation}
Donor total donations: ${donor.totalDonations}
Donor is verified: ${donor.isVerified}

Return:
{
  "score": 0-100,
  "compatible": true | false,
  "reason": "brief explanation"
}`;

    const text = await chat(prompt);
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Groq match error:", err.message);
    return { score: 50, compatible: true, reason: "AI scoring unavailable" };
  }
};

export const generateHealthTip = async (donorProfile) => {
  try {
    const prompt = `Generate a personalized post-donation health tip for a blood donor. Return ONLY valid JSON, no markdown.

Blood type: ${donorProfile.bloodType}
Total donations: ${donorProfile.totalDonations}
Age: ${donorProfile.age || "unknown"}

Return:
{
  "tip": "one actionable health tip",
  "title": "short title for the tip"
}`;

    const text = await chat(prompt, "You are a medical health advisor. Respond with valid JSON only.");
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Groq health tip error:", err.message);
    return { tip: "Stay hydrated and rest for 24 hours after donation.", title: "Post-donation care" };
  }
};

// Feature 5: AI Demand Forecasting
export const forecastDemand = async (historicalData) => {
  try {
    const summary = historicalData.slice(0, 15).map(d =>
      `${d._id.bloodType} in ${d._id.city}: ${d.count} requests, ${d.critical} critical, ${d.fulfilled} fulfilled`
    ).join("\n");

    const prompt = `Based on 30 days of blood donation requests, forecast next week's demand. Return ONLY valid JSON, no markdown.

Historical data:
${summary}

Return:
{
  "predictions": [
    { "bloodType": "O-", "city": "Bengaluru", "riskLevel": "high"|"medium"|"low", "reason": "brief reason", "recommendedDonors": 5 }
  ],
  "summary": "one paragraph overall forecast",
  "topRisk": "blood type most likely to be critical next week"
}`;

    const text = await chat(prompt, "You are a medical supply forecasting AI. Respond with valid JSON only.");
    const cleaned = text.replace(/```json|```/g,"").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Groq forecast error:", err.message);
    return {
      predictions: [],
      summary: "Forecast unavailable. Ensure Groq API key is configured.",
      topRisk: "O-"
    };
  }
};
