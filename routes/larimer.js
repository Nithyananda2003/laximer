import express from "express";
import { search } from "../controllers/taxController.js";

const router = express.Router();

router.post("/search", search);

export default router;
