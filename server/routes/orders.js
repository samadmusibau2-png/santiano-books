const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const db = require("../db/pool");
const requireAuth = require("../middleware/auth");

/* =====================================================
   PAYSTACK REQUEST HELPER
===================================================== */

async function paystackRequest(endpoint, options = {}) {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  }

  const response = await fetch(
    `https://api.paystack.co${endpoint}`,
    {
      ...options,

      headers: {
        Authorization:
          `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,

        "Content-Type":
          "application/json",

        ...(options.headers || {}),
      },
    }
  );

  const data = await response.json();

  if (!response.ok || !data.status) {
    throw new Error(
      data.message ||
      "Paystack request failed."
    );
  }

  return data;
}


/* =====================================================
   SAFE BOOK FILE PATH
===================================================== */

function getBookFilePath(fileKey) {
  if (!fileKey) {
    return null;
  }

  const serverRoot =
    path.resolve(__dirname, "..");

  const filePath =
    path.resolve(
      serverRoot,
      fileKey
    );

  /*
    Prevent a file_key such as:
    ../../something
    from escaping the server directory.
  */

  if (
    filePath !== serverRoot &&
    !filePath.startsWith(
      serverRoot + path.sep
    )
  ) {
    return null;
  }

  return filePath;
}


/* =====================================================
   CHECK BOOK PDF
===================================================== */

function ensureBookFileExists(book) {
  if (!book.file_key) {
    throw new Error(
      `The PDF for "${book.title}" is not available.`
    );
  }

  const filePath =
    getBookFilePath(
      book.file_key
    );

  if (
    !filePath ||
    !fs.existsSync(filePath)
  ) {
    throw new Error(
      `The PDF for "${book.title}" is temporarily unavailable.`
    );
  }

  return filePath;
}


/* =====================================================
   GET MY ORDERS
   GET /api/orders
===================================================== */

router.get(
  "/",
  requireAuth,
  async (req, res) => {
    try {
      const result =
        await db.query(
          `
          SELECT
            o.id,
            o.status,
            o.currency,
            o.total_kobo,
            o.created_at,

            COALESCE(
              json_agg(
                json_build_object(
                  'book_id', oi.book_id,
                  'quantity', oi.quantity,
                  'unit_price_kobo', oi.unit_price_kobo,
                  'title', b.title,
                  'cover_key', b.cover_key
                )
              )
              FILTER (
                WHERE oi.id IS NOT NULL
              ),
              '[]'
            ) AS items

          FROM orders o

          LEFT JOIN order_items oi
            ON oi.order_id = o.id

          LEFT JOIN books b
            ON b.id = oi.book_id

          WHERE o.user_id = $1

          GROUP BY o.id

          ORDER BY o.created_at DESC
          `,
          [req.user.id]
        );

      res.json({
        orders:
          result.rows.map(
            order => ({
              id: Number(order.id),

              status:
                order.status,

              currency:
                order.currency,

              total_kobo:
                Number(
                  order.total_kobo
                ),

              created_at:
                order.created_at,

              items:
                order.items || [],
            })
          ),
      });

    } catch (error) {
      console.error(
        "Get orders error:",
        error
      );

      res.status(500).json({
        error:
          "Unable to load your orders.",
      });
    }
  }
);


/* =====================================================
   CREATE DRAFT ORDER
   POST /api/orders/draft
===================================================== */

router.post(
  "/draft",
  requireAuth,
  async (req, res) => {
    const client =
      await db.connect();

    try {
      const {
        items,
      } = req.body;

      if (
        !Array.isArray(items) ||
        items.length === 0
      ) {
        return res.status(400).json({
          error:
            "Cart is empty.",
        });
      }

      await client.query(
        "BEGIN"
      );

      let totalKobo = 0;

      const orderItems = [];

      /* ================================================
         VALIDATE EVERY BOOK
      ================================================ */

      for (const item of items) {
        const bookId =
          Number(
            item.book_id ||
            item.id
          );

        const quantity =
          Number(
            item.quantity ||
            item.qty ||
            1
          );

        if (
          !Number.isInteger(
            bookId
          ) ||
          bookId <= 0
        ) {
          throw new Error(
            "Invalid book ID."
          );
        }

        if (
          !Number.isInteger(
            quantity
          ) ||
          quantity < 1
        ) {
          throw new Error(
            "Invalid quantity."
          );
        }

        const bookResult =
          await client.query(
            `
            SELECT
              id,
              title,
              price_kobo,
              is_published,
              file_key
            FROM books
            WHERE id = $1
            FOR SHARE
            `,
            [bookId]
          );

        if (
          bookResult.rows.length === 0
        ) {
          throw new Error(
            `Book not found: ${bookId}`
          );
        }

        const book =
          bookResult.rows[0];

        /* ==============================================
           BOOK MUST BE PUBLISHED
        ============================================== */

        if (
          !book.is_published
        ) {
          throw new Error(
            `Book is not available: ${book.title}`
          );
        }

        /* ==============================================
           PDF MUST EXIST BEFORE ORDER CREATION
        ============================================== */

        ensureBookFileExists(
          book
        );

        /* ==============================================
           VALIDATE DATABASE PRICE
        ============================================== */

        const unitPriceKobo =
          Number(
            book.price_kobo
          );

        if (
          !Number.isInteger(
            unitPriceKobo
          ) ||
          unitPriceKobo < 0
        ) {
          throw new Error(
            `Invalid price for book: ${book.title}`
          );
        }

        const itemTotal =
          unitPriceKobo *
          quantity;

        totalKobo +=
          itemTotal;

        orderItems.push({
          bookId:
            book.id,

          quantity,

          unitPriceKobo,
        });
      }

      /* ==============================================
         VALIDATE TOTAL
      ============================================== */

      if (
        !Number.isInteger(
          totalKobo
        ) ||
        totalKobo <= 0
      ) {
        throw new Error(
          "The order total must be greater than zero."
        );
      }

      /* ==============================================
         CREATE ORDER
      ============================================== */

      const orderResult =
        await client.query(
          `
          INSERT INTO orders (
            user_id,
            status,
            currency,
            total_kobo
          )
          VALUES (
            $1,
            $2,
            $3,
            $4
          )
          RETURNING
            id,
            user_id,
            status,
            currency,
            total_kobo
          `,
          [
            req.user.id,
            "pending",
            "NGN",
            totalKobo,
          ]
        );

      const order =
        orderResult.rows[0];

      /* ==============================================
         SAVE ORDER ITEMS
      ============================================== */

      for (
        const item of orderItems
      ) {
        await client.query(
          `
          INSERT INTO order_items (
            order_id,
            book_id,
            quantity,
            unit_price_kobo
          )
          VALUES (
            $1,
            $2,
            $3,
            $4
          )
          `,
          [
            order.id,
            item.bookId,
            item.quantity,
            item.unitPriceKobo,
          ]
        );
      }

      await client.query(
        "COMMIT"
      );

      res.status(201).json({
        ok: true,

        order: {
          id:
            Number(
              order.id
            ),

          user_id:
            Number(
              order.user_id
            ),

          status:
            order.status,

          currency:
            order.currency,

          total_kobo:
            Number(
              order.total_kobo
            ),
        },
      });

    } catch (error) {
      await client.query(
        "ROLLBACK"
      );

      console.error(
        "Create draft order error:",
        error
      );

      res.status(400).json({
        error:
          error.message ||
          "Could not create draft order.",
      });

    } finally {
      client.release();
    }
  }
);


/* =====================================================
   INITIALIZE PAYSTACK PAYMENT
   POST /api/orders/paystack/initialize
===================================================== */

router.post(
  "/paystack/initialize",
  requireAuth,
  async (req, res) => {
    try {
      const orderId =
        Number(
          req.body.order_id
        );

      if (
        !Number.isInteger(
          orderId
        ) ||
        orderId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid order ID.",
        });
      }

      /* ==============================================
         GET ORDER
      ============================================== */

      const orderResult =
        await db.query(
          `
          SELECT
            id,
            user_id,
            total_kobo,
            currency,
            status
          FROM orders
          WHERE id = $1
          LIMIT 1
          `,
          [orderId]
        );

      if (
        orderResult.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            "Order does not exist.",
        });
      }

      const order =
        orderResult.rows[0];

      /* ==============================================
         VERIFY OWNER
      ============================================== */

      if (
        Number(
          order.user_id
        ) !==
        Number(
          req.user.id
        )
      ) {
        return res.status(403).json({
          error:
            "You cannot pay for this order.",
        });
      }

      /* ==============================================
         ORDER MUST STILL BE PENDING
      ============================================== */

      if (
        order.status !==
        "pending"
      ) {
        return res.status(400).json({
          error:
            "This order cannot be paid for.",
        });
      }

      if (
        order.currency !==
        "NGN"
      ) {
        return res.status(400).json({
          error:
            "This order uses an unsupported currency.",
        });
      }

      const totalKobo =
        Number(
          order.total_kobo
        );

      if (
        !Number.isInteger(
          totalKobo
        ) ||
        totalKobo <= 0
      ) {
        return res.status(400).json({
          error:
            "Order total is invalid.",
        });
      }

      /* ==============================================
         CUSTOMER EMAIL
      ============================================== */

      const email =
        req.user.email;

      if (!email) {
        return res.status(400).json({
          error:
            "Customer email is required.",
        });
      }

      /* ==============================================
         VERIFY ALL BOOK FILES AGAIN
         BEFORE PAYSTACK PAYMENT
      ============================================== */

      const itemsResult =
        await db.query(
          `
          SELECT
            oi.book_id,
            oi.quantity,
            b.id,
            b.title,
            b.file_key,
            b.is_published
          FROM order_items oi
          INNER JOIN books b
            ON b.id = oi.book_id
          WHERE oi.order_id = $1
          `,
          [orderId]
        );

      if (
        itemsResult.rows.length === 0
      ) {
        return res.status(400).json({
          error:
            "This order has no books.",
        });
      }

      for (
        const item of itemsResult.rows
      ) {
        if (
          !item.is_published
        ) {
          return res.status(400).json({
            error:
              `Book is no longer available: ${item.title}`,
          });
        }

        try {
          ensureBookFileExists(
            item
          );
        } catch (error) {
          return res.status(400).json({
            error:
              error.message,
          });
        }
      }

      /* ==============================================
         CREATE PAYSTACK REFERENCE
      ============================================== */

      const reference =
        `SANTIANO-${order.id}-${Date.now()}`;

      /* ==============================================
         INITIALIZE PAYSTACK
      ============================================== */

      const payment =
        await paystackRequest(
          "/transaction/initialize",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                email,

                amount:
                  totalKobo,

                currency:
                  "NGN",

                reference,

                metadata: {
                  order_id:
                    Number(
                      order.id
                    ),

                  user_id:
                    Number(
                      req.user.id
                    ),
                },
              }),
          }
        );

      res.json({
        ok: true,

        access_code:
          payment.data
            .access_code,

        authorization_url:
          payment.data
            .authorization_url,

        reference:
          payment.data
            .reference,
      });

    } catch (error) {
      console.error(
        "Paystack initialization error:",
        error
      );

      res.status(400).json({
        error:
          error.message ||
          "Unable to initialize payment.",
      });
    }
  }
);


/* =====================================================
   VERIFY PAYSTACK PAYMENT
   POST /api/orders/paystack/verify
===================================================== */

router.post(
  "/paystack/verify",
  requireAuth,
  async (req, res) => {
    const client =
      await db.connect();

    try {
      const {
        reference,
      } = req.body;

      if (!reference) {
        return res.status(400).json({
          error:
            "Payment reference is required.",
        });
      }

      /* ==============================================
         VERIFY TRANSACTION WITH PAYSTACK
      ============================================== */

      const payment =
        await paystackRequest(
          `/transaction/verify/${encodeURIComponent(
            reference
          )}`,
          {
            method:
              "GET",
          }
        );

      const transaction =
        payment.data;

      /* ==============================================
         PAYMENT MUST BE SUCCESSFUL
      ============================================== */

      if (
        transaction.status !==
          "success" ||
        transaction.currency !==
          "NGN"
      ) {
        return res.status(400).json({
          error:
            "Payment was not successful.",
        });
      }

      /* ==============================================
         GET ORDER ID FROM PAYSTACK METADATA
      ============================================== */

      const orderId =
        Number(
          transaction
            .metadata
            ?.order_id
        );

      if (
        !Number.isInteger(
          orderId
        ) ||
        orderId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid order reference.",
        });
      }

      await client.query(
        "BEGIN"
      );

      /* ==============================================
         LOCK ORDER
      ============================================== */

      const orderResult =
        await client.query(
          `
          SELECT
            id,
            user_id,
            total_kobo,
            currency,
            status
          FROM orders
          WHERE id = $1
          FOR UPDATE
          `,
          [orderId]
        );

      if (
        orderResult.rows.length === 0
      ) {
        throw new Error(
          "Order does not exist."
        );
      }

      const order =
        orderResult.rows[0];

      /* ==============================================
         VERIFY CUSTOMER
      ============================================== */

      if (
        Number(
          order.user_id
        ) !==
        Number(
          req.user.id
        )
      ) {
        throw new Error(
          "You cannot verify this order."
        );
      }

      /* ==============================================
         VERIFY CURRENCY
      ============================================== */

      if (
        order.currency !==
        "NGN"
      ) {
        throw new Error(
          "This order does not use NGN."
        );
      }

      /* ==============================================
         VERIFY PAYMENT AMOUNT
      ============================================== */

      if (
        Number(
          transaction.amount
        ) !==
        Number(
          order.total_kobo
        )
      ) {
        throw new Error(
          "Payment amount does not match the order total."
        );
      }

      /* ==============================================
         VERIFY PAYSTACK USER METADATA
      ============================================== */

      const metadataUserId =
        Number(
          transaction
            .metadata
            ?.user_id
        );

      if (
        metadataUserId !==
        Number(
          order.user_id
        )
      ) {
        throw new Error(
          "Payment customer does not match the order."
        );
      }

      /* ==============================================
         GET BOOKS IN ORDER
      ============================================== */

      const itemsResult =
        await client.query(
          `
          SELECT
            oi.book_id,
            oi.quantity,
            b.title,
            b.file_key,
            b.is_published
          FROM order_items oi
          INNER JOIN books b
            ON b.id = oi.book_id
          WHERE oi.order_id = $1
          `,
          [orderId]
        );

      if (
        itemsResult.rows.length === 0
      ) {
        throw new Error(
          "This order has no books."
        );
      }

      /* ==============================================
         VERIFY BOOKS ARE STILL AVAILABLE
      ============================================== */

      for (
        const item of itemsResult.rows
      ) {
        if (
          !item.is_published
        ) {
          throw new Error(
            `Book is no longer available: ${item.title}`
          );
        }

        ensureBookFileExists(
          item
        );
      }

      /* ==============================================
         ADD / UPDATE LIBRARY
         
         FIRST PURCHASE:
           downloaded_at = NULL
         
         REPURCHASE:
           downloaded_at = NULL again
         
         This creates:
           PAYMENT → DOWNLOAD
      ============================================== */

      for (
        const item of itemsResult.rows
      ) {
        await client.query(
          `
          INSERT INTO library (
            user_id,
            book_id,
            order_id,
            purchased_at,
            downloaded_at
          )
          VALUES (
            $1,
            $2,
            $3,
            NOW(),
            NULL
          )
          ON CONFLICT (
            user_id,
            book_id
          )
          DO UPDATE SET
            order_id =
              EXCLUDED.order_id,

            purchased_at =
              EXCLUDED.purchased_at,

            downloaded_at =
              NULL
          `,
          [
            order.user_id,
            item.book_id,
            orderId,
          ]
        );
      }

      /* ==============================================
         MARK ORDER PAID
      ============================================== */

      await client.query(
        `
        UPDATE orders
        SET
          status = 'paid',
          payment_reference = $1
        WHERE id = $2
        `,
        [
          reference,
          orderId,
        ]
      );

      await client.query(
        "COMMIT"
      );

      res.json({
        ok: true,

        order_id:
          Number(
            orderId
          ),

        status:
          "paid",

        message:
          "Payment verified and books are now available for download.",
      });

    } catch (error) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (rollbackError) {
        console.error(
          "Rollback error:",
          rollbackError
        );
      }

      console.error(
        "Paystack verification error:",
        error
      );

      res.status(400).json({
        error:
          error.message ||
          "Payment verification failed.",
      });

    } finally {
      client.release();
    }
  }
);


module.exports = router;