import express from "express";
import { getETAPrediction } from "../controllers/eta.controller.js";

const router = express.Router();

router.post("/predict-eta", getETAPrediction);

export default router;
