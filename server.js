import express from "express";
import bodyParser from "body-parser";
import larimerRoutes from "./routes/larimer.js";

const app = express();
const PORT = process.env.PORT || 3000;

// EJS setup
app.set("view engine", "ejs");
app.set("views", "./views");

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use("/larimer", larimerRoutes);

// Home route with form
app.get("/", (req, res) => {
    res.render("home_form");
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
