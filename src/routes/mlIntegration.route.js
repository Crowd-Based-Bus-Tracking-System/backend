import express from "express";
import { trainArrivalModelController, trainOccupancyModelController, trainETAModelController } from "../controllers/mlIntegration.controller.js";

const router = express.Router();

router.post("/train-arrival-model", trainArrivalModelController);
router.post("/train-occupancy-model", trainOccupancyModelController);
router.post("/train-eta-model", trainETAModelController);

export default router;