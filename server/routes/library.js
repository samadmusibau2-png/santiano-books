const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const requireAuth = require("../middleware/auth");
const pool = require("../db/pool");

// Get books owned by the logged-in user
router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        books.id,
        books.title,
        books.author,
        books.description,
        books.category,
        books.cover_key,
        books.file_key,
        books.created_at
      FROM library
      INNER JOIN books
        ON books.id = library.book_id
      WHERE library.user_id = $1
      ORDER BY books.created_at DESC
      `,
      [req.user.id]
    );

    res.json({
      books: result.rows,
    });
  } catch (error) {
    console.error("Library fetch error:", error);

    res.status(500).json({
      error: "Unable to load your library",
    });
  }
});

// Download a purchased book
router.get("/:bookId/download", requireAuth, async (req, res) => {
  try {
    const bookId = Number(req.params.bookId);

    if (!Number.isInteger(bookId) || bookId <= 0) {
      return res.status(400).json({
        error: "Invalid book ID",
      });
    }

    const result = await pool.query(
      `
      SELECT books.file_key, books.title
      FROM library
      INNER JOIN books
        ON books.id = library.book_id
      WHERE library.user_id = $1
        AND books.id = $2
      LIMIT 1
      `,
      [req.user.id, bookId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Book not found in your library",
      });
    }

    const { file_key, title } = result.rows[0];

    if (!file_key) {
      return res.status(404).json({
        error: "This book has no PDF file",
      });
    }

    const serverRoot = path.resolve(__dirname, "..");
    const filePath = path.resolve(serverRoot, file_key);

    if (
      filePath !== serverRoot &&
      !filePath.startsWith(serverRoot + path.sep)
    ) {
      return res.status(400).json({
        error: "Invalid file path",
      });
    }

    if (!fs.existsSync(filePath)) {
      console.error("Book file missing:", filePath);

      return res.status(404).json({
        error: "Book file not found on the server",
      });
    }

    res.download(filePath, `${title || "book"}.pdf`);
  } catch (error) {
    console.error("Book download error:", error);

    res.status(500).json({
      error: "Unable to download book",
    });
  }
});

module.exports = router;