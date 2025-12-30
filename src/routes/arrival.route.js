import express from "express";
import { ReportArrival } from "../controllers/arrival.controller.js";

const router = express.Router();

router.post("/report-arrival", ReportArrival);

export default router;