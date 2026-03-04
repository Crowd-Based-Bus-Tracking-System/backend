import express from "express";
import { ReportArrival, getRecentReports, upvoteArrivalReport } from "../controllers/arrival.controller.js";

const router = express.Router();

router.post("/report-arrival", ReportArrival);
router.get("/reports/:busId", getRecentReports);
router.post("/:reportId/upvote", upvoteArrivalReport);

export default router;
