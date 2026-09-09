const express = require("express");

const router = express.Router();
const pool = require("../db/pool");

/* =========================
   GET ALL PUBLISHED BOOKS
   GET /api/books
========================= */

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        title,
        slug,
        description,
        category,
        author,
        price_kobo,
        cover_key,
        file_key,
        is_published,
        created_at
      FROM books
      WHERE is_published = TRUE
      ORDER BY created_at DESC
    `);

    res.json({
      books: result.rows,
    });
  } catch (error) {
    console.error("Books fetch error:", error);

    res.status(500).json({
      error: "Unable to load books",
    });
  }
});

/* =========================
   GET ONE BOOK
   GET /api/books/:id
========================= */

router.get("/:id", async (req, res) => {
  try {
    const bookId = Number(req.params.id);

    if (!Number.isInteger(bookId) || bookId <= 0) {
      return res.status(400).json({
        error: "Invalid book ID",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        title,
        slug,
        description,
        category,
        author,
        price_kobo,
        cover_key,
        file_key,
        is_published,
        created_at
      FROM books
      WHERE id = $1
        AND is_published = TRUE
      LIMIT 1
      `,
      [bookId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Book not found",
      });
    }

    res.json({
      book: result.rows[0],
    });
  } catch (error) {
    console.error("Single book fetch error:", error);

    res.status(500).json({
      error: "Unable to load book details",
    });
  }
});

module.exports = router;