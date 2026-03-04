import express from "express";
import { ReportOccupancy, GetCurrentOccupancy, PredictOccupancy, GetOccupancyReports } from "../controllers/occupancy.controller.js";

const router = express.Router();

router.post("/report", ReportOccupancy);
router.get("/current/:busId", GetCurrentOccupancy);
router.get("/predict/:busId/:stopId", PredictOccupancy);
router.get("/reports/:busId", GetOccupancyReports);

export default router;
