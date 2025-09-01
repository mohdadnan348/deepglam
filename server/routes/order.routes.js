// routes/order.routes.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');

// GET all orders
router.get('/orders', orderController.getAllOrders);

// POST create new order
router.post('/orders', orderController.placeOrder);

// GET single order by ID
router.get('/orders/:id', orderController.getOrderById);

// PATCH update order status
router.patch('/orders/:id/status', orderController.updateStatus);

// Shortcut routes
router.patch('/orders/:id/pack', orderController.markPacked);
router.patch('/orders/:id/deliver', orderController.markDelivered);

module.exports = router;
