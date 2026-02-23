import express from "express";
import { getETAPrediction, getRouteBuses } from "../controllers/eta.controller.js";

const router = express.Router();

router.post("/predict-eta", getETAPrediction);
router.get("/route/:routeId/buses", getRouteBuses);

export default router;
