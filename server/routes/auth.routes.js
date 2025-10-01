const express = require("express");
const router = express.Router();
const authCtrl = require("../controllers/auth.controller");
const { getAllUsersAdmin } = require("../controllers/auth.controller");

router.post("/register", authCtrl.register);
router.post("/login", authCtrl.login);
router.post("/change-password",  authCtrl.changePassword);

router.post("/send-otp", authCtrl.sendOtp);
router.post("/verify-otp", authCtrl.verifyOtp);
router.post("/reset-password", authCtrl.resetPassword);

router.get("/alluser", authCtrl.getAllUsersAdmin);


module.exports = router;
