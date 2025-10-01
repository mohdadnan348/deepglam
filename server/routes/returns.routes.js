const express = require("express");
const router = express.Router();
const { verifyJWT } = require("../middlewares/auth.middleware");
const buyerCtrl = require("../controllers/buyer.controller");

router.use(verifyJWT);

router.get("/", buyerCtrl.getReturnRequests);
router.post("/", buyerCtrl.createReturnRequest);

module.exports = router;
