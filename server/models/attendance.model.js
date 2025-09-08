const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    date: { type: String, required: true }, 
    checkIn: { type: Date },
    checkOut: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Attendance", attendanceSchema);
