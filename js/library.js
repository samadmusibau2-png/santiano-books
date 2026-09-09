const API = "http://localhost:3000/api";

/* =========================
   AUTH TOKEN
========================= */
function getAuthToken() {
  return localStorage.getItem("santianoToken");
}

/* =========================
   USER
========================= */
function getUser() {
  try {
    return JSON.parse(
      localStorage.getItem("santianoUser") || "null"
    );
  } catch {
    return null;
  }
}

/* =========================
   COVER URL
========================= */
function coverUrl(coverKey) {
  if (!coverKey) return "";
  const cleanKey = String(coverKey)
   .replace(/^uploads[\\/]+/, "") // removed uploads/ or uploads\
   .replace(/[\\]+/g, "/"); // convert all \ to /

  return `${API}/files/${cleanKey
   .split("/")
   .map(encodeURIComponent)
   .join("/")}`;
}

/* =========================
   HTML SECURITY
========================= */
function escapeHTML(value) {
  return String(value?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]
  );
}

/* =========================
   DATE
========================= */
function formatDate(date) {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* =========================
   REDIRECT TO LOGIN
========================= */
function redirectToLogin() {
  localStorage.setItem(
    "santianoLibraryReturn",
    "library.html"
  );
  location.href = "login.html";
}

/* =========================
   DOWNLOAD BOOK
========================= */
async function downloadBook(bookId, bookTitle) {
  const token = getAuthToken();
  if (!token) {
    redirectToLogin();
    return;
  }
  const button = document.querySelector(
    `[data-download-book="${bookId}"]`
  );
  const originalText = button
   ? button.textContent
    : "DOWNLOAD";
  try {
    if (button) {
      button.disabled = true;
      button.textContent = "PREPARING...";
    }
    const response = await fetch(
      `${API}/library/${encodeURIComponent(bookId)}/download`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.status === 401 || response.status === 403) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        localStorage.removeItem("santianoToken");
        localStorage.removeItem("santianoUser");
        redirectToLogin();
        return;
      }
      throw new Error(
        data.error || "You have not purchased this book."
      );
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(
        data.error || "Unable to download this book."
      );
    }
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `${bookTitle || "Santiano Book"}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error("Santiano download error:", error);
    alert(error.message || "Unable to download this book.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

/* =========================
   BOOK CARD
========================= */
function libraryBookCard(book) {
  const cover = coverUrl(book.cover_key);
  return `
    <article class="book-card">
      <div class="cover">
        ${
          cover
           ? `
              <img
                src="${cover}"
                alt="${escapeHTML(book.title)} cover"
                style="
                  width:100%;
                  height:100%;
                  object-fit:cover;
                  border-radius:inherit;
                  display:block;
                "
                onerror="this.style.display='none';"
              >
            `
            : `
              <h3>${escapeHTML(book.title)}</h3>
              <small>SANTIANO BOOKS</small>
            `
        }
      </div>
      <h3>
        ${escapeHTML(book.title)}
      </h3>
      <div class="category">
        ${escapeHTML(book.category || "General")}
      </div>
      <div class="library-date muted">
        Purchased: ${formatDate(book.purchased_at)}
      </div>
      <div class="book-actions">
        <button
          type="button"
          data-download-book="${book.id}"
          onclick="downloadBook(
            ${book.id},
            '${escapeHTML(book.title).replace(/'/g, "\\'")}'
          )"
        >
          DOWNLOAD
        </button>
      </div>
    </article>
  `;
}

/* =========================
   LOAD LIBRARY
========================= */
async function loadLibrary() {
  const message = document.querySelector(
    "[data-library-message]"
  );
  const grid = document.querySelector(
    "[data-library-grid]"
  );
  if (!message ||!grid) return;

  const token = getAuthToken();
  if (!token) {
    redirectToLogin();
    return;
  }
  message.textContent = "Loading your library...";
  try {
    const response = await fetch(`${API}/library`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await response.json();
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("santianoToken");
      localStorage.removeItem("santianoUser");
      redirectToLogin();
      return;
    }
    if (!response.ok) {
      throw new Error(
        data.error || "Unable to load your library."
      );
    }
    const libraryBooks = Array.isArray(data.books)
     ? data.books
      : [];
    if (!libraryBooks.length) {
      message.innerHTML = `
        You haven't purchased any books yet.
        <a
          href="books.html"
          style="
            color:#b8893d;
            font-weight:700;
          "
        >
          Explore books →
        </a>
      `;
      grid.innerHTML = "";
      return;
    }
    message.textContent =
      `${libraryBooks.length} book${
        libraryBooks.length === 1? "" : "s"
      } in your library.`;
    grid.innerHTML = libraryBooks
     .map(libraryBookCard)
     .join("");
  } catch (error) {
    console.error("Santiano Library error:", error);
    message.textContent =
      error.message || "Unable to load your library.";
  }
}

/* =========================
   LOGOUT
========================= */
function logout() {
  localStorage.removeItem("santianoToken");
  localStorage.removeItem("santianoUser");
  localStorage.removeItem("santianoPendingOrder");
  location.href = "login.html";
}

/* =========================
   LOGOUT BUTTON
========================= */
function setupLogout() {
  const button = document.getElementById("logoutButton");
  if (!button) return;
  button.addEventListener("click", logout);
}

/* =========================
   PAGE START
========================= */
document.addEventListener("DOMContentLoaded", () => {
  const cart = JSON.parse(
    localStorage.getItem("santianoCart") || "[]"
  );
  const cartCount = cart.reduce(
    (total, item) => total + Number(item.qty || 0),
    0
  );
  document
   .querySelectorAll("[data-cart-count]")
   .forEach((element) => {
      element.textContent = cartCount;
    });

  const user = getUser();
  const nameElement = document.querySelector(
    "[data-user-name]"
  );
  if (nameElement && user) {
    nameElement.textContent =
      user.full_name ||
      user.name ||
      "Reader";
  }
  setupLogout();
  loadLibrary();
});