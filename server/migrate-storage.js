require("dotenv").config();

const fs = require("fs");
const path = require("path");

const supabase = require("./supabase/client");
const pool = require("./db/pool");

const ebooksDir = path.join(__dirname, "uploads", "ebooks");
const coversDir = path.join(__dirname, "uploads", "covers");

const books = [
  {
    id: 3,
    ebook: "1788143209174-95604a49c136481e.pdf",
    cover: "1788143209274-de97b2a11c593b9e.jpeg"
  },
  {
    id: 4,
    ebook: "1788611204208-7a1e0996e9ac0c61.pdf",
    cover: "1788611204267-ac2da000a4cbe591.jpg"
  },
  {
    id: 5,
    ebook: "1788614341942-8078d5f34367192e.pdf",
    cover: "1788614342002-8fb4e45105144892.jpg"
  },
  {
    id: 6,
    ebook: "1788630326689-bc64eaa1ec0c0a69.pdf",
    cover: "1788630327050-c6ece70795823b40.jpg"
  },
  {
    id: 7,
    ebook: "1789122725112-9337b7febd4da0b7.pdf",
    cover: "1789122725380-f7414e98352ceeb0.jpeg"
  }
];

async function migrate() {
  try {
    console.log("Starting Supabase Storage migration...\n");

    for (const book of books) {
      console.log(`Migrating book ID ${book.id}...`);

      const ebookPath = path.join(ebooksDir, book.ebook);
      const coverPath = path.join(coversDir, book.cover);

      if (!fs.existsSync(ebookPath)) {
        throw new Error(`Ebook not found: ${ebookPath}`);
      }

      if (!fs.existsSync(coverPath)) {
        throw new Error(`Cover not found: ${coverPath}`);
      }

      const ebookBuffer = fs.readFileSync(ebookPath);
      const coverBuffer = fs.readFileSync(coverPath);

      const ebookKey = `ebooks/${book.ebook}`;
      const coverKey = `covers/${book.cover}`;

      // Upload ebook
      const ebookUpload = await supabase.storage
        .from("ebooks")
        .upload(ebookKey, ebookBuffer, {
          contentType: "application/pdf",
          upsert: true
        });

      if (ebookUpload.error) {
        throw new Error(
          `Ebook upload failed for book ${book.id}: ${ebookUpload.error.message}`
        );
      }

      console.log("  ✓ Ebook uploaded");

      // Detect cover type
      const extension = path.extname(book.cover).toLowerCase();

      let contentType = "image/jpeg";

      if (extension === ".png") {
        contentType = "image/png";
      } else if (extension === ".webp") {
        contentType = "image/webp";
      }

      // Upload cover
      const coverUpload = await supabase.storage
        .from("covers")
        .upload(coverKey, coverBuffer, {
          contentType,
          upsert: true
        });

      if (coverUpload.error) {
        throw new Error(
          `Cover upload failed for book ${book.id}: ${coverUpload.error.message}`
        );
      }

      console.log("  ✓ Cover uploaded");

      // Update database
      await pool.query(
        `
        UPDATE books
        SET
          file_key = $1,
          cover_key = $2
        WHERE id = $3
        `,
        [ebookKey, coverKey, book.id]
      );

      console.log("  ✓ Database updated");
      console.log("");
    }

    console.log("=================================");
    console.log("Migration completed successfully!");
    console.log("=================================\n");

    process.exit(0);
  } catch (error) {
    console.error("\nMigration failed:");
    console.error(error.message);

    process.exit(1);
  }
}

migrate();