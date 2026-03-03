import { Router } from "express";
import { getRoutes, getRouteTimetable } from "../controllers/route.controller.js";

const routeRouter = Router();

routeRouter.get("/", getRoutes);
routeRouter.get("/:routeId/timetable", getRouteTimetable);

export default routeRouter;
