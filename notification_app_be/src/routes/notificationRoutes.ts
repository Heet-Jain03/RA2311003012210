// src/routes/notificationRoutes.ts
import { Router } from "express";
import {
  getAllNotifications,
  getPriorityInbox,
} from "../controllers/notificationController";

const router = Router();

// GET /api/notifications       - All notifications
router.get("/", getAllNotifications);

// GET /api/notifications/priority?top=10  - Priority inbox top N
router.get("/priority", getPriorityInbox);

export default router;
