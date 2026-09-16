// routes/library.js

const express = require("express");

const router = express.Router();

const requireAuth =
  require("../middleware/auth");

const pool =
  require("../db/pool");

const supabase =
  require("../supabase/client");


/* =====================================================
   GET MY LIBRARY
   GET /api/library
===================================================== */

router.get(
  "/",
  requireAuth,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            books.id,
            books.title,
            books.author,
            books.description,
            books.category,
            books.price_kobo,
            books.cover_key,
            books.file_key,
            books.created_at,

            library.purchased_at,
            library.downloaded_at

          FROM library

          INNER JOIN books
            ON books.id =
              library.book_id

          WHERE library.user_id = $1

          ORDER BY
            library.purchased_at DESC
          `,
          [req.user.id]
        );

      res.json({
        books:
          result.rows,
      });

    } catch (error) {
      console.error(
        "Library fetch error:",
        error
      );

      res.status(500).json({
        error:
          "Unable to load your library",
      });
    }
  }
);


/* =====================================================
   DOWNLOAD BOOK
   GET /api/library/:bookId/download
===================================================== */

router.get(
  "/:bookId/download",
  requireAuth,
  async (req, res) => {
    try {
      const bookId =
        Number(
          req.params.bookId
        );

      if (
        !Number.isInteger(
          bookId
        ) ||
        bookId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid book ID",
        });
      }


      /* ==============================================
         CONFIRM OWNERSHIP
      ============================================== */

      const result =
        await pool.query(
          `
          SELECT
            library.user_id,
            library.book_id,
            library.downloaded_at,

            books.file_key,
            books.title

          FROM library

          INNER JOIN books
            ON books.id =
              library.book_id

          WHERE
            library.user_id = $1
            AND books.id = $2

          LIMIT 1
          `,
          [
            req.user.id,
            bookId,
          ]
        );


      if (
        result.rows.length === 0
      ) {
        return res.status(403).json({
          error:
            "You have not purchased this book.",
        });
      }


      const libraryBook =
        result.rows[0];

      const {
        file_key,
        title,
      } = libraryBook;


      /* ==============================================
         BOOK MUST HAVE A PDF
      ============================================== */

      if (!file_key) {
        return res.status(404).json({
          error:
            "This book has no PDF file.",
        });
      }


      /* ==============================================
         CREATE SIGNED URL
         
         SUPABASE BUCKET:
         ebooks

         BUCKET MUST REMAIN PRIVATE.

         The service-role key stays on Render.
      ============================================== */

      const {
        data,
        error: signedUrlError,
      } =
        await supabase.storage
          .from("ebooks")
          .createSignedUrl(
            file_key,
            300
          );


      if (
        signedUrlError ||
        !data?.signedUrl
      ) {
        console.error(
          "Supabase signed URL error:",
          signedUrlError
        );

        return res.status(500).json({
          error:
            "Unable to prepare your book for download.",
        });
      }


      /* ==============================================
         RECORD DOWNLOAD
      ============================================== */

      try {
        await pool.query(
          `
          UPDATE library

          SET
            downloaded_at =
              COALESCE(
                downloaded_at,
                NOW()
              )

          WHERE
            user_id = $1
            AND book_id = $2
          `,
          [
            req.user.id,
            bookId,
          ]
        );

        console.log(
          `Book download authorized: user=${req.user.id}, book=${bookId}`
        );

      } catch (updateError) {
        console.error(
          "Unable to record book download:",
          updateError
        );
      }


      /* ==============================================
         REDIRECT TO TEMPORARY SIGNED URL
      ============================================== */

      return res.redirect(
        302,
        data.signedUrl
      );

    } catch (error) {
      console.error(
        "Book download error:",
        error
      );

      if (
        !res.headersSent
      ) {
        return res.status(500).json({
          error:
            "Unable to download book.",
        });
      }
    }
  }
);


module.exports = router;