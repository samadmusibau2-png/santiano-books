/* =====================================================
   SANTIANO BOOKS — APP.JS
===================================================== */

/* =========================
   API CONFIGURATION
========================= */

window.SANTIANO_API =
  window.SANTIANO_API || "http://localhost:3000/api";

function apiUrl(path = "") {
  return `${window.SANTIANO_API}/${String(path).replace(/^\/+/, "")}`;
}

/* =========================
   APPLICATION STATE
========================= */

let books = [];
let activeCategory = "All";
let searchTerm = "";

/* =========================
   MONEY — NGN / KOBO
========================= */

function money(kobo) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(kobo || 0) / 100);
}

/* =========================
   COVER URL
========================= */

function coverUrl(coverKey) {
  if (!coverKey) return "";

  let cleanKey = String(coverKey).trim();

  if (
    cleanKey.startsWith("http://") ||
    cleanKey.startsWith("https://")
  ) {
    return cleanKey;
  }

  cleanKey = cleanKey
    .replace(/^\/+/, "")
    .replace(/^api\/files\//, "")
    .replace(/^uploads\//, "")
    .replace(/\\/g, "/");

  return `${apiUrl("files")}/${cleanKey
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/* =========================
   AUTHENTICATION
========================= */

function getAuthToken() {
  return localStorage.getItem("santianoToken");
}

function getCurrentUser() {
  try {
    return JSON.parse(
      localStorage.getItem("santianoUser") || "null"
    );
  } catch {
    return null;
  }
}

function isLoggedIn() {
  return Boolean(getAuthToken());
}

function logout() {
  localStorage.removeItem("santianoToken");
  localStorage.removeItem("santianoUser");
  localStorage.removeItem("santianoPendingOrder");
  localStorage.removeItem("santianoCheckoutReturn");

  window.location.href = "index.html";
}

/* =========================
   USER-SPECIFIC CART
========================= */

function getCartKey() {
  const user = getCurrentUser();

  if (user && user.id) {
    return `santianoCart_${user.id}`;
  }

  return "santianoCart_guest";
}

function getCart() {
  try {
    const cart = JSON.parse(
      localStorage.getItem(getCartKey()) || "[]"
    );

    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function setCart(cart) {
  localStorage.setItem(
    getCartKey(),
    JSON.stringify(cart)
  );
}

/* =========================
   CART COUNT
========================= */

function updateCartCount() {
  const count = getCart().reduce(
    (total, item) =>
      total + Number(item.qty || 0),
    0
  );

  document
    .querySelectorAll("[data-cart-count]")
    .forEach(element => {
      element.textContent = count;
    });
}

/* =========================
   ADD TO CART
========================= */

function addToCart(id) {
  const book = books.find(
    item => Number(item.id) === Number(id)
  );

  if (!book) {
    console.error("Book not found:", id);
    return;
  }

  const cart = getCart();

  const existingItem = cart.find(
    item => Number(item.id) === Number(id)
  );

  if (existingItem) {
    existingItem.qty =
      Number(existingItem.qty || 1) + 1;
  } else {
    cart.push({
      id: Number(book.id),
      title: book.title,
      author: book.author,
      description: book.description,
      category: book.category,
      price_kobo: Number(
        book.price_kobo ??
        book.price_cents ??
        0
      ),
      cover_key: book.cover_key,
      qty: 1,
    });
  }

  setCart(cart);
  updateCartCount();

  alert(`${book.title} added to cart.`);
}

/* =========================
   REMOVE FROM CART
========================= */

function removeFromCart(id) {
  const updatedCart = getCart().filter(
    item => Number(item.id) !== Number(id)
  );

  setCart(updatedCart);
  updateCartCount();
  renderCart();
}

/* =========================
   CHECKOUT
========================= */

async function startCheckout() {
  const cart = getCart();

  if (!cart.length) {
    alert("Your cart is empty.");
    return;
  }

  const token = getAuthToken();

  if (!token) {
    localStorage.setItem(
      "santianoCheckoutReturn",
      "cart.html"
    );

    window.location.href = "login.html";
    return;
  }

  const items = cart.map(item => ({
    book_id: Number(item.id),
    quantity: Number(item.qty || 1),
  }));

  try {
    const response = await fetch(
      apiUrl("orders/draft"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Unable to create order."
      );
    }

    if (!data.order) {
      throw new Error(
        "The server did not return an order."
      );
    }

    const orderId = Number(data.order.id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new Error(
        "The server returned an invalid order ID."
      );
    }

    const pendingOrder = {
      ...data.order,
      id: orderId,
      total_kobo: Number(
        data.order.total_kobo ??
        data.order.total_cents ??
        0
      ),
      currency: String(
        data.order.currency || "NGN"
      ).toUpperCase(),
    };

    localStorage.setItem(
      "santianoPendingOrder",
      JSON.stringify(pendingOrder)
    );

    window.location.href = "checkout.html";
  } catch (error) {
    console.error(
      "Santiano checkout error:",
      error
    );

    alert(
      error.message ||
      "Unable to start checkout."
    );
  }
}

/* =========================
   BOOK CARD
========================= */

function bookCard(book) {
  const cover = coverUrl(book.cover_key);

  const price = Number(
    book.price_kobo ??
    book.price_cents ??
    0
  );

  return `
    <article class="book-card">

      <div class="cover">
        ${
          cover
            ? `
              <img
                src="${escapeHtml(cover)}"
                alt="${escapeHtml(book.title)} cover"
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
              <h3>${escapeHtml(book.title)}</h3>
              <small>SANTIANO BOOKS</small>
            `
        }
      </div>

      <h3>${escapeHtml(book.title)}</h3>

      <div class="category">
        ${escapeHtml(book.category || "General")}
      </div>

      <div class="price">
        ${money(price)}
      </div>

      <div class="book-actions">

        <button
          type="button"
          onclick="location.href='book.html?id=${Number(book.id)}'"
        >
          VIEW
        </button>

        <button
          type="button"
          onclick="addToCart(${Number(book.id)})"
        >
          ADD
        </button>

      </div>

    </article>
  `;
}

/* =========================
   LOAD BOOKS
========================= */

async function loadBooks() {
  const grid = document.querySelector(
    "[data-books-grid]"
  );

  try {
    const response = await fetch(
      apiUrl("books")
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Unable to load books."
      );
    }

    books = Array.isArray(data.books)
      ? data.books
      : [];

    renderBooks();
    renderBook();
  } catch (error) {
    console.error(
      "Santiano Books API error:",
      error
    );

    if (grid) {
      grid.innerHTML = `
        <p class="muted">
          Unable to load books right now.
        </p>
      `;
    }
  }
}

/* =========================
   FILTER AND SEARCH BOOKS
========================= */

function filterBooks(category) {
  activeCategory = category || "All";

  const grid = document.querySelector(
    "[data-books-grid]"
  );

  const resultCount = document.querySelector(
    "[data-books-result-count]"
  );

  if (!grid) return;

  const normalizedSearch = searchTerm
    .trim()
    .toLowerCase();

  const filteredBooks = books.filter(book => {
    const matchesCategory =
      activeCategory === "All" ||
      String(book.category || "")
        .trim()
        .toLowerCase() ===
      activeCategory.trim().toLowerCase();

    const searchableText = [
      book.title,
      book.author,
      book.category,
      book.description,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !normalizedSearch ||
      searchableText.includes(normalizedSearch);

    return matchesCategory && matchesSearch;
  });

  if (resultCount) {
    resultCount.textContent =
      `${filteredBooks.length} book${
        filteredBooks.length === 1 ? "" : "s"
      } found`;
  }

  if (!filteredBooks.length) {
    grid.innerHTML = `
      <div class="muted" style="padding:30px 0">
        <h3>No books found</h3>
        <p>
          Try another search term or choose
          a different category.
        </p>
      </div>
    `;

    return;
  }

  grid.innerHTML = filteredBooks
    .map(bookCard)
    .join("");
}

/* =========================
   CATEGORY BUTTONS
========================= */

function setupCategories() {
  const categoryLinks =
    document.querySelectorAll(
      "[data-category]"
    );

  categoryLinks.forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();

      const category =
        link.dataset.category;

      categoryLinks.forEach(item =>
        item.classList.remove("active")
      );

      link.classList.add("active");

      filterBooks(category);
    });
  });
}

/* =========================
   BOOK SEARCH
========================= */

function setupBookSearch() {
  const searchInput =
    document.querySelector("#book-search");

  const clearButton =
    document.querySelector("#clear-search");

  if (!searchInput) return;

  searchInput.addEventListener("input", event => {
    searchTerm = event.target.value;

    if (clearButton) {
      clearButton.classList.toggle(
        "visible",
        Boolean(searchTerm.trim())
      );
    }

    filterBooks(activeCategory);
  });

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      searchTerm = "";
      searchInput.value = "";

      clearButton.classList.remove("visible");

      filterBooks(activeCategory);
      searchInput.focus();
    });
  }
}

/* =========================
   RENDER BOOKS
========================= */

function renderBooks() {
  const grid = document.querySelector(
    "[data-books-grid]"
  );

  if (!grid) return;

  filterBooks(activeCategory);
}

/* =========================
   RENDER CART
========================= */

function renderCart() {
  const box = document.querySelector(
    "[data-cart]"
  );

  if (!box) return;

  const cart = getCart();

  if (!cart.length) {
    box.innerHTML = `
      <p class="muted">
        Your cart is empty.

        <a
          href="books.html"
          style="color:#b8893d;font-weight:700"
        >
          Explore books →
        </a>
      </p>
    `;

    return;
  }

  let total = 0;

  const cartItems = cart
    .map(item => {
      const quantity = Number(
        item.qty || 1
      );

      const price = Number(
        item.price_kobo ??
        item.price_cents ??
        0
      );

      total += price * quantity;

      const cover = coverUrl(
        item.cover_key
      );

      return `
        <div class="cart-row">

          <div class="mini-cover">
            ${
              cover
                ? `
                  <img
                    src="${escapeHtml(cover)}"
                    alt="${escapeHtml(item.title)} cover"
                    style="
                      width:100%;
                      height:100%;
                      object-fit:cover;
                      display:block;
                    "
                  >
                `
                : escapeHtml(item.title)
            }
          </div>

          <div>
            <b>${escapeHtml(item.title)}</b>

            <div class="muted">
              ${escapeHtml(
                item.category || "General"
              )}
            </div>
          </div>

          <div>
            ${money(price)} × ${quantity}
          </div>

          <button
            type="button"
            onclick="removeFromCart(${Number(item.id)})"
          >
            Remove
          </button>

        </div>
      `;
    })
    .join("");

  box.innerHTML = `
    ${cartItems}

    <div class="cart-total">
      Total:
      <b>${money(total)}</b>

      <br>

      <button
        class="gold-btn"
        style="margin-top:15px"
        type="button"
        onclick="startCheckout()"
      >
        Proceed to Checkout
      </button>
    </div>
  `;
}

/* =========================
   BOOK DETAIL
========================= */

function renderBook() {
  const element = document.querySelector(
    "[data-book-detail]"
  );

  if (!element || !books.length) return;

  const id =
    Number(
      new URLSearchParams(
        location.search
      ).get("id")
    ) || books[0].id;

  const book =
    books.find(
      item => Number(item.id) === id
    ) || books[0];

  const cover = coverUrl(
    book.cover_key
  );

  const price = Number(
    book.price_kobo ??
    book.price_cents ??
    0
  );

  element.innerHTML = `
    <div class="cover">
      ${
        cover
          ? `
            <img
              src="${escapeHtml(cover)}"
              alt="${escapeHtml(book.title)} cover"
              style="
                width:100%;
                height:100%;
                object-fit:cover;
                border-radius:inherit;
                display:block;
              "
            >
          `
          : `
            <h3>${escapeHtml(book.title)}</h3>
            <small>SANTIANO BOOKS</small>
          `
      }
    </div>

    <div>

      <div class="eyebrow">
        Digital eBook
      </div>

      <h1>${escapeHtml(book.title)}</h1>

      <p>
        <strong>
          By ${escapeHtml(
            book.author || "Santiano Books"
          )}
        </strong>
      </p>

      <div class="category">
        ${escapeHtml(
          book.category || "General"
        )}
      </div>

      <div class="price">
        ${money(price)}
      </div>

      <p class="muted">
        ${escapeHtml(
          book.description ||
          "No description available."
        )}
      </p>

      <ul>
        <li>Instant digital access after purchase</li>
        <li>eBook / PDF format</li>
        <li>Read on phone, tablet or computer</li>
        <li>Personal library access</li>
      </ul>

      <div class="detail-actions">

        <button
          class="gold-btn"
          type="button"
          onclick="
            addToCart(${Number(book.id)});
            location.href='cart.html';
          "
        >
          BUY NOW
        </button>

        <button
          class="outline-btn"
          type="button"
          onclick="addToCart(${Number(book.id)})"
        >
          ADD TO CART
        </button>

      </div>

    </div>
  `;
}

/* =========================
   ESCAPE HTML
========================= */

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[character]
  );
}

/* =========================
   START APPLICATION
========================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    updateCartCount();
    renderCart();
    setupCategories();
    setupBookSearch();
    loadBooks();
  }
);