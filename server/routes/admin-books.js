const express = require("express");
const multer = require("multer");
const crypto = require("crypto");

const pool = require("../db/pool");
const supabase = require("../supabase/client");
const { requireAdmin } = require("../middleware/admin");

const router = express.Router();

// =========================
// MULTER
// =========================
// Files are kept temporarily in memory,
// then uploaded directly to Supabase Storage.

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 200 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    if (
      file.fieldname === "ebook" &&
      file.mimetype !== "application/pdf"
    ) {
      return cb(
        new Error("The eBook must be a PDF.")
      );
    }

    if (
      file.fieldname === "cover" &&
      ![
        "image/jpeg",
        "image/png",
        "image/webp"
      ].includes(file.mimetype)
    ) {
      return cb(
        new Error("Cover must be JPG, PNG or WebP.")
      );
    }

    cb(null, true);
  }
});

// =========================
// ADMIN AUTH
// =========================

router.use(requireAdmin);

// =========================
// GET ALL BOOKS
// =========================

router.get("/books", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        title,
        author,
        slug,
        description,
        category,
        price_kobo,
        file_key,
        cover_key,
        is_published,
        created_at
      FROM books
      ORDER BY created_at DESC
    `);

    res.json({
      books: result.rows
    });

  } catch (error) {
    next(error);
  }
});

// =========================
// CREATE BOOK
// =========================

router.post(
  "/books",
  upload.fields([
    {
      name: "ebook",
      maxCount: 1
    },
    {
      name: "cover",
      maxCount: 1
    }
  ]),
  async (req, res, next) => {
    let uploadedEbookKey = null;
    let uploadedCoverKey = null;

    try {
      const {
        title,
        author,
        description,
        category,
        price_kobo,
        isPublished
      } = req.body;

      const ebook = req.files?.ebook?.[0];
      const cover = req.files?.cover?.[0];

      // =========================
      // VALIDATION
      // =========================

      if (
        !title ||
        !description ||
        !price_kobo ||
        !ebook
      ) {
        return res.status(400).json({
          error:
            "Title, description, price and PDF eBook are required."
        });
      }

      const priceKobo = Number(price_kobo);

      if (
        !Number.isFinite(priceKobo) ||
        priceKobo <= 0
      ) {
        return res.status(400).json({
          error: "Price must be greater than zero."
        });
      }

      // =========================
      // SLUG
      // =========================

      const slug = (
        String(title).trim() +
        "-" +
        crypto.randomBytes(4).toString("hex")
      )
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // =========================
      // STORAGE FILE NAMES
      // =========================

      const ebookExtension = ".pdf";

      const ebookFilename =
        Date.now() +
        "-" +
        crypto.randomBytes(8).toString("hex") +
        ebookExtension;

      const ebookKey = `ebooks/${ebookFilename}`;

      let coverKey = null;

      if (cover) {
        const originalExtension =
          cover.originalname
            .split(".")
            .pop()
            .toLowerCase();

        const coverFilename =
          Date.now() +
          "-" +
          crypto.randomBytes(8).toString("hex") +
          "." +
          originalExtension;

        coverKey = `covers/${coverFilename}`;
      }

      // =========================
      // UPLOAD EBOOK
      // =========================

      const ebookUpload =
        await supabase.storage
          .from("ebooks")
          .upload(
            ebookKey,
            ebook.buffer,
            {
              contentType: "application/pdf",
              upsert: false
            }
          );

      if (ebookUpload.error) {
        throw new Error(
          `eBook upload failed: ${ebookUpload.error.message}`
        );
      }

      uploadedEbookKey = ebookKey;

      // =========================
      // UPLOAD COVER
      // =========================

      if (cover && coverKey) {
        const coverUpload =
          await supabase.storage
            .from("covers")
            .upload(
              coverKey,
              cover.buffer,
              {
                contentType: cover.mimetype,
                upsert: false
              }
            );

        if (coverUpload.error) {
          throw new Error(
            `Cover upload failed: ${coverUpload.error.message}`
          );
        }

        uploadedCoverKey = coverKey;
      }

      // =========================
      // DATABASE
      // =========================

      const result = await pool.query(
        `
        INSERT INTO books (
          title,
          author,
          slug,
          description,
          category,
          price_kobo,
          file_key,
          cover_key,
          is_published
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9
        )
        RETURNING
          id,
          title,
          author,
          slug,
          description,
          category,
          price_kobo,
          file_key,
          cover_key,
          is_published,
          created_at
        `,
        [
          String(title).trim(),

          String(
            author || "Musibau Samad Eniola"
          ).trim(),

          slug,

          String(description).trim(),

          String(category || "General").trim(),

          Math.round(priceKobo),

          ebookKey,

          coverKey,

          isPublished !== "false"
        ]
      );

      // =========================
      // SUCCESS
      // =========================

      res.status(201).json({
        message: "Book created successfully.",
        book: result.rows[0]
      });

    } catch (error) {

      // =========================
      // CLEANUP STORAGE
      // =========================
      // If the database insert or another
      // operation fails after uploading,
      // remove the uploaded files so we
      // don't leave orphaned files.

      if (uploadedEbookKey) {
        await supabase.storage
          .from("ebooks")
          .remove([uploadedEbookKey])
          .catch(() => {});
      }

      if (uploadedCoverKey) {
        await supabase.storage
          .from("covers")
          .remove([uploadedCoverKey])
          .catch(() => {});
      }

      next(error);
    }
  }
);

// =========================
// PUBLISH / UNPUBLISH
// =========================

router.patch(
  "/books/:id/publish",
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
        UPDATE books
        SET is_published = NOT is_published
        WHERE id = $1
        RETURNING
          id,
          title,
          is_published
        `,
        [req.params.id]
      );

      if (!result.rowCount) {
        return res.status(404).json({
          error: "Book not found."
        });
      }

      res.json({
        book: result.rows[0]
      });

    } catch (error) {
      next(error);
    }
  }
);

// =========================
// REMOVE BOOK
// =========================
// Soft delete: keeps orders and
// purchased library records safe.

router.delete(
  "/books/:id",
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
        UPDATE books
        SET is_published = false
        WHERE id = $1
        RETURNING
          id,
          title,
          is_published
        `,
        [req.params.id]
      );

      if (!result.rowCount) {
        return res.status(404).json({
          error: "Book not found."
        });
      }

      res.json({
        message: "Book removed from the store.",
        book: result.rows[0]
      });

    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;