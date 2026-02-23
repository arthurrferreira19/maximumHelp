const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");

const { notFound, errorHandler } = require("./middlewares/errorMiddleware");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");

// se você já criou:
const sectorRoutes = require("./routes/sectorRoutes");
const userRoutes = require("./routes/userRoutes");
const ticketRoutes = require("./routes/ticketRoutes");
const chatRoutes = require("./routes/chatRoutes");

const app = express();

/** =========================
 * Helmet (CSP liberando CDNs + inline styles)
 * ========================= */
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],

        // ✅ Bootstrap CSS + inline style="..."
        styleSrc: ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],

        // ✅ Scripts via CDN
        scriptSrc: ["'self'", "https://unpkg.com", "https://cdn.jsdelivr.net", "'unsafe-inline'"],

        // Imagens
        imgSrc: ["'self'", "data:", "https:"],

        // Fontes
        fontSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],

        // ✅ Para sourcemaps / requests do unpkg/jsdelivr
        connectSrc: ["'self'", "ws:", "wss:", "https://cdn.jsdelivr.net", "https://unpkg.com"]
      }
    }
  })
);

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

/** =========================
 * Static (Front)
 * ========================= */
const publicPath = path.join(__dirname, "..", "public");
app.use(express.static(publicPath));
app.use("/assets", express.static(path.join(publicPath, "assets")));
app.use("/admin", express.static(path.join(publicPath, "admin")));
app.use("/user", express.static(path.join(publicPath, "user")));
const uploadsRoot = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
const fs = require("fs");
fs.mkdirSync(uploadsRoot, { recursive: true });
app.use("/uploads", express.static(uploadsRoot));

/** (Opcional) silenciar log do Chrome DevTools */
app.get("/.well-known/appspecific/com.chrome.devtools.json", (req, res) => res.status(204).end());

/** =========================
 * API
 * ========================= */
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

// se existem no seu projeto:
app.use("/api/sectors", sectorRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/chat", chatRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
