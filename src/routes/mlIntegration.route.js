import express from "express";
import { trainArrivalModelController } from "../controllers/mlIntegration.controller.js";

const router = express.Router();

router.post("/train-arrival-model", trainArrivalModelController);

export default router;