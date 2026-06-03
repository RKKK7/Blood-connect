import nodemailer from "nodemailer";
import Notification from "../models/Notification.js";
import { io } from "../index.js";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

export const sendNotification = async ({ userId, title, message, type = "system", link = "", email = null }) => {
  try {
    const notification = await Notification.create({ userId, title, message, type, link });
    io.to(userId.toString()).emit("notification", { title, message, type, link });

    if (email) {
      await transporter.sendMail({
        from: `"BloodConnect" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `BloodConnect: ${title}`,
        html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto">
          <h2 style="color:#e53e3e">🩸 BloodConnect</h2>
          <h3>${title}</h3>
          <p>${message}</p>
          ${link ? `<a href="${process.env.CLIENT_URL}${link}" style="background:#e53e3e;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:12px">View Details</a>` : ""}
          <hr style="margin-top:24px"/>
          <p style="color:#888;font-size:12px">BloodConnect — saving lives together</p>
        </div>`,
      }).catch(err => console.error("Email error:", err.message));
    }

    return notification;
  } catch (err) {
    console.error("Notification error:", err.message);
  }
};

export const broadcastRequest = (request) => {
  io.emit("new_request", request);
};
