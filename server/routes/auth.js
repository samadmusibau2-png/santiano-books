const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");


/* =========================
   CREATE JWT TOKEN
========================= */

function makeToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
}


/* =========================
   EMAIL TRANSPORTER
========================= */

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true,
  family: 4,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});


/* =========================
   REGISTER
========================= */

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        error: "Name, email and password are required"
      });
    }

    const cleanName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!cleanName || !normalizedEmail || !password) {
      return res.status(400).json({
        error: "Name, email and password are required"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters"
      });
    }

    const db = req.app.locals.db;

    const existing = await db.query(
      `
      SELECT id
      FROM users
      WHERE email = $1
      `,
      [normalizedEmail]
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({
        error: "An account with that email already exists"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await db.query(
      `
      INSERT INTO users
        (full_name, email, password_hash)
      VALUES
        ($1, $2, $3)
      RETURNING
        id,
        full_name,
        email,
        role,
        created_at
      `,
      [
        cleanName,
        normalizedEmail,
        passwordHash
      ]
    );

    const row = result.rows[0];

    const user = {
      id: row.id,
      name: row.full_name,
      email: row.email,
      role: row.role,
      created_at: row.created_at
    };

    const token = makeToken(user);

    res.status(201).json({
      user,
      token
    });

  } catch (error) {
    next(error);
  }
});


/* =========================
   LOGIN
========================= */

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        error: "Email and password are required"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({
        error: "Email and password are required"
      });
    }

    const db = req.app.locals.db;

    const result = await db.query(
      `
      SELECT
        id,
        full_name,
        email,
        password_hash,
        role,
        created_at
      FROM users
      WHERE email = $1
      `,
      [normalizedEmail]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    const row = result.rows[0];

    const validPassword = await bcrypt.compare(
      password,
      row.password_hash
    );

    if (!validPassword) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    const user = {
      id: row.id,
      name: row.full_name,
      email: row.email,
      role: row.role,
      created_at: row.created_at
    };

    const token = makeToken(user);

    res.json({
      user,
      token
    });

  } catch (error) {
    next(error);
  }
});


/* =========================
   FORGOT PASSWORD
========================= */

router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body;

    if (typeof email !== "string") {
      return res.status(400).json({
        error: "Email is required"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({
        error: "Email is required"
      });
    }

    const db = req.app.locals.db;

    const result = await db.query(
      `
      SELECT id, email
      FROM users
      WHERE email = $1
      `,
      [normalizedEmail]
    );

    /*
      Do not reveal whether an email
      exists in the database.
    */

    const responseMessage =
      "If an account with that email exists, a password-reset link has been sent.";

    if (result.rowCount === 0) {
      return res.json({
        message: responseMessage
      });
    }

    const user = result.rows[0];

    /*
      Remove previous reset tokens
      belonging to this user.
    */

    await db.query(
      `
      DELETE FROM password_reset_tokens
      WHERE user_id = $1
      `,
      [user.id]
    );

    /*
      Generate a secure random token.
      Only its hash is stored in PostgreSQL.
    */

    const rawToken = crypto.randomBytes(32).toString("hex");

    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    /*
      The token expires after 30 minutes.
    */

    await db.query(
      `
      INSERT INTO password_reset_tokens
        (user_id, token_hash, expires_at)
      VALUES
        ($1, $2, NOW() + INTERVAL '30 minutes')
      `,
      [
        user.id,
        tokenHash
      ]
    );

    const clientUrl = process.env.CLIENT_URL;

    const resetLink =
      `${clientUrl}/reset-password.html?token=${rawToken}`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: user.email,
      subject: "Reset your Santiano Books password",

      text: `
You requested a password reset for your Santiano Books account.

Use the following link to create a new password:

${resetLink}

This link expires in 30 minutes.

If you did not request this, you can ignore this email.
      `,

      html: `
        <h2>Reset your Santiano Books password</h2>

        <p>You requested a password reset for your account.</p>

        <p>
          <a href="${resetLink}">
            Click here to create a new password
          </a>
        </p>

        <p>This link expires in 30 minutes.</p>

        <p>If you did not request this, you can ignore this email.</p>
      `
    });

    res.json({
      message: responseMessage
    });

  } catch (error) {
    next(error);
  }
});


/* =========================
   RESET PASSWORD
========================= */

router.post("/reset-password", async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (
      typeof token !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        error: "Token and password are required"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters"
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const db = req.app.locals.db;

    const result = await db.query(
      `
      SELECT
        id,
        user_id
      FROM password_reset_tokens
      WHERE token_hash = $1
        AND expires_at > NOW()
      `,
      [tokenHash]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({
        error: "This reset link is invalid or has expired"
      });
    }

    const resetToken = result.rows[0];

    const passwordHash = await bcrypt.hash(password, 12);

    /*
      Update the password and delete the token
      inside one database transaction.
    */

    await db.query("BEGIN");

    try {
      await db.query(
        `
        UPDATE users
        SET password_hash = $1
        WHERE id = $2
        `,
        [
          passwordHash,
          resetToken.user_id
        ]
      );

      await db.query(
        `
        DELETE FROM password_reset_tokens
        WHERE id = $1
        `,
        [resetToken.id]
      );

      await db.query("COMMIT");

    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }

    res.json({
      message: "Your password has been reset successfully"
    });

  } catch (error) {
    next(error);
  }
});


/* =========================
   EXPORT
========================= */

module.exports = router;