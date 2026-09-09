const jwt = require("jsonwebtoken");

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Admin authentication required"
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      error: "Admin authentication token missing"
    });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const tokenEmail = String(payload.email || "")
      .trim()
      .toLowerCase();

    const adminEmail = String(process.env.ADMIN_EMAIL || "")
      .trim()
      .toLowerCase();

    if (!adminEmail) {
      console.error("ADMIN_EMAIL is missing from .env");

      return res.status(500).json({
        error: "Admin configuration is missing"
      });
    }

    if (tokenEmail !== adminEmail) {
      console.error("Admin email mismatch:", {
        tokenEmail,
        adminEmail
      });

      return res.status(403).json({
        error: "Admin access denied"
      });
    }

    req.user = payload;

    next();

  } catch (error) {
    console.error("Admin authentication error:", error.message);

    return res.status(401).json({
      error: "Invalid or expired token"
    });
  }
}

module.exports = {
  requireAdmin
};