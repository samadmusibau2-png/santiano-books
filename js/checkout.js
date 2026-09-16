/* =====================================================
   SANTIANO BOOKS — CHECKOUT.JS
===================================================== */

const CHECKOUT_API =
  window.SANTIANO_API ||
  "https://santiano-books.onrender.com/api";

/*
   Paystack public key.

   Public keys are safe to use in frontend code.
   NEVER put a Paystack secret key here.
*/
const PAYSTACK_PUBLIC_KEY =
  "pk_live_87c9da8d951f26772deb4bdfa3c3f2d832b9de25";


/* =====================================================
   SUPABASE COVER STORAGE
===================================================== */

const SUPABASE_COVERS =
  "https://zzgjyznobxsfktcaaple.supabase.co/storage/v1/object/public/covers";


/* =====================================================
   AUTH TOKEN
===================================================== */

function getToken() {
  return localStorage.getItem("santianoToken");
}


/* =====================================================
   REPURCHASE CHECK
===================================================== */

function isRepurchase() {
  return (
    localStorage.getItem("santianoRepurchase") === "1"
  );
}


/* =====================================================
   GET USER
===================================================== */

function getCheckoutUser() {
  try {
    return JSON.parse(
      localStorage.getItem("santianoUser") || "null"
    );
  } catch (error) {
    console.error("Unable to read user:", error);
    return null;
  }
}


/* =====================================================
   GET CART KEY
===================================================== */

function getCheckoutCartKey() {
  const user = getCheckoutUser();

  if (user && user.id) {
    return `santianoCart_${user.id}`;
  }

  return "santianoCart_guest";
}


/* =====================================================
   GET PENDING ORDER
===================================================== */

function getPendingOrder() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(
        "santianoPendingOrder"
      ) || "null"
    );

    if (!saved) {
      return null;
    }

    return {
      ...saved,

      id: Number(saved.id),

      total_kobo: Number(
        saved.total_kobo || 0
      ),

      currency: String(
        saved.currency || "NGN"
      ).toUpperCase()
    };

  } catch (error) {
    console.error(
      "Unable to read pending order:",
      error
    );

    return null;
  }
}


/* =====================================================
   GET CHECKOUT CART
===================================================== */

function getCheckoutCart() {
  try {
    const cart = JSON.parse(
      localStorage.getItem(
        getCheckoutCartKey()
      ) || "[]"
    );

    return Array.isArray(cart)
      ? cart
      : [];

  } catch (error) {
    console.error(
      "Unable to read checkout cart:",
      error
    );

    return [];
  }
}


/* =====================================================
   FORMAT NGN
===================================================== */

function checkoutMoney(kobo) {
  return new Intl.NumberFormat(
    "en-NG",
    {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ).format(
    Number(kobo || 0) / 100
  );
}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
  );
}


/* =====================================================
   COVER URL
===================================================== */

function getCoverUrl(coverKey) {
  if (!coverKey) {
    return "";
  }

  let cleanKey = String(coverKey)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  /*
     Remove old storage prefixes.
  */

  cleanKey = cleanKey
    .replace(/^uploads\/covers\//i, "")
    .replace(/^uploads\//i, "")
    .replace(/^covers\//i, "");

  /*
     If the database somehow contains
     a complete Supabase URL, use it.
  */

  if (
    cleanKey.startsWith("http://") ||
    cleanKey.startsWith("https://")
  ) {
    return cleanKey;
  }

  /*
     Supabase public covers bucket.
  */

  return (
    SUPABASE_COVERS +
    "/" +
    cleanKey
      .split("/")
      .map(encodeURIComponent)
      .join("/")
  );
}


/* =====================================================
   CLEAR CHECKOUT
===================================================== */

function clearCheckout() {
  const cartKey =
    getCheckoutCartKey();

  /*
     REPURCHASE:
     Restore the customer's original cart.
  */

  if (isRepurchase()) {
    const originalCart =
      localStorage.getItem(
        "santianoRepurchaseOriginalCart"
      );

    if (originalCart !== null) {
      localStorage.setItem(
        cartKey,
        originalCart
      );
    }

    localStorage.removeItem(
      "santianoRepurchaseOriginalCart"
    );

    localStorage.removeItem(
      "santianoRepurchase"
    );

  } else {

    /*
       NORMAL CHECKOUT:
       Remove the normal cart.
    */

    localStorage.removeItem(
      cartKey
    );
  }

  localStorage.removeItem(
    "santianoPendingOrder"
  );
}


/* =====================================================
   RENDER CHECKOUT
===================================================== */

function renderCheckout() {
  const container =
    document.querySelector(
      "[data-checkout]"
    );

  if (!container) {
    console.error(
      "Checkout container not found."
    );

    return;
  }

  const token = getToken();

  if (!token) {
    window.location.href =
      "login.html";

    return;
  }

  const order =
    getPendingOrder();

  const cart =
    getCheckoutCart();

  console.log(
    "Pending order:",
    order
  );

  console.log(
    "Checkout cart:",
    cart
  );


  /* =================================================
     NO ORDER
  ================================================= */

  if (
    !order ||
    !Number.isInteger(order.id) ||
    order.id <= 0
  ) {
    container.innerHTML = `
      <div class="cart-box">

        <h2>
          No pending order
        </h2>

        <p class="muted">
          Please return to your cart
          and start checkout again.
        </p>

        <a
          href="cart.html"
          class="gold-btn"
        >
          RETURN TO CART
        </a>

      </div>
    `;

    return;
  }


  /* =================================================
     CURRENCY
  ================================================= */

  if (order.currency !== "NGN") {
    container.innerHTML = `
      <div class="cart-box">

        <div class="eyebrow">
          ORDER #${escapeHTML(order.id)}
        </div>

        <h2>
          New checkout required
        </h2>

        <p class="muted">
          This order uses
          ${escapeHTML(order.currency)}.

          Santiano Books currently
          uses NGN for payments.
        </p>

        <button
          class="gold-btn"
          id="newOrderButton"
          type="button"
        >
          CREATE NEW ORDER
        </button>

      </div>
    `;

    document
      .getElementById("newOrderButton")
      ?.addEventListener(
        "click",
        () => {
          clearCheckout();

          window.location.href =
            "cart.html";
        }
      );

    return;
  }


  /* =================================================
     CART
  ================================================= */

  if (!cart.length) {
    container.innerHTML = `
      <div class="cart-box">

        <h2>
          Your cart is empty
        </h2>

        <p class="muted">
          We could not find the
          books connected to this
          order.
        </p>

        <a
          href="cart.html"
          class="gold-btn"
        >
          RETURN TO CART
        </a>

      </div>
    `;

    return;
  }


  /* =================================================
     ITEMS
  ================================================= */

  const itemsHTML =
    cart
      .map(item => {

        const quantity =
          Number(item.qty || 1);

        const price =
          Number(
            item.price_kobo ||
            0
          );

        const subtotal =
          price * quantity;

        const cover =
          getCoverUrl(
            item.cover_key
          );

        return `
          <article
            class="checkout-item"
          >

            <div
              class="checkout-item-cover"
            >

              ${
                cover
                  ? `
                    <img
                      src="${escapeHTML(cover)}"
                      alt="${escapeHTML(
                        item.title
                      )} cover"
                      onerror="
                        this.style.display='none';
                      "
                    >
                  `
                  : `
                    <span>
                      ${escapeHTML(
                        item.title
                      )}
                    </span>
                  `
              }

            </div>


            <div
              class="checkout-item-info"
            >

              <h3>
                ${escapeHTML(
                  item.title
                )}
              </h3>

              <p class="muted">
                By
                ${escapeHTML(
                  item.author ||
                  "Santiano Books"
                )}
              </p>

              <p class="muted">
                Quantity:
                ${quantity}
              </p>

            </div>


            <strong
              class="checkout-item-price"
            >
              ${checkoutMoney(
                subtotal
              )}
            </strong>

          </article>
        `;
      })
      .join("");


  const totalKobo =
    Number(
      order.total_kobo || 0
    );


  /* =================================================
     CHECKOUT UI
  ================================================= */

  container.innerHTML = `
    <section
      class="cart-box checkout-box"
    >

      <div class="eyebrow">
        ORDER #${escapeHTML(
          order.id
        )}
      </div>


      ${
        isRepurchase()
          ? `
            <div
              class="ownership-status"
              style="margin-bottom:10px"
            >
              ✓ ALREADY OWNED
            </div>
          `
          : ""
      }


      <h2>
        Your Order
      </h2>


      <div
        class="checkout-items"
      >
        ${itemsHTML}
      </div>


      <div
        class="cart-total checkout-total"
      >

        <span>
          Total
        </span>

        <strong>
          ${checkoutMoney(
            totalKobo
          )}
        </strong>

      </div>


      <div
        class="checkout-payment"
      >

        <h3>
          Payment
        </h3>


        <p class="muted">
          Pay securely with Paystack.
        </p>


        ${
          isRepurchase()
            ? `
              <p class="muted">
                You already own this book.
                This payment creates a new
                purchase and makes the book
                available for download again.
              </p>
            `
            : ""
        }


        <button
          class="gold-btn"
          id="payButton"
          type="button"
        >
          PAY
          ${checkoutMoney(
            totalKobo
          )}
        </button>


        <p
          id="checkoutMessage"
          class="muted"
        ></p>

      </div>

    </section>
  `;


  document
    .getElementById("payButton")
    ?.addEventListener(
      "click",
      beginPayment
    );
}


/* =====================================================
   INITIALIZE PAYMENT
===================================================== */

async function beginPayment() {
  const message =
    document.getElementById(
      "checkoutMessage"
    );

  const button =
    document.getElementById(
      "payButton"
    );

  const order =
    getPendingOrder();

  const token =
    getToken();


  if (!message || !button) {
    return;
  }


  if (
    !order ||
    !Number.isInteger(order.id) ||
    order.id <= 0
  ) {
    message.textContent =
      "Your pending order is invalid. Please return to your cart.";

    return;
  }


  if (!token) {
    window.location.href =
      "login.html";

    return;
  }


  button.disabled = true;

  button.textContent =
    "PREPARING PAYMENT...";

  message.textContent =
    "Checking your order...";


  try {

    /* ==============================================
       CHECK PUBLIC KEY CONFIGURATION
    ============================================== */

    if (
      !PAYSTACK_PUBLIC_KEY ||
      (
        !PAYSTACK_PUBLIC_KEY.startsWith("pk_test_") &&
        !PAYSTACK_PUBLIC_KEY.startsWith("pk_live_")
      )
    ) {
      throw new Error(
        "Paystack public key is not configured correctly."
      );
    }


    /* ==============================================
       INITIALIZE PAYMENT THROUGH BACKEND
    ============================================== */

    const response =
      await fetch(
        `${CHECKOUT_API}/orders/paystack/initialize`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`
          },

          body:
            JSON.stringify({
              order_id:
                order.id
            })
        }
      );


    let data;

    try {
      data = await response.json();
    } catch (jsonError) {
      throw new Error(
        "The payment server returned an invalid response."
      );
    }


    console.log(
      "Paystack initialize response:",
      data
    );


    if (!response.ok) {
      throw new Error(
        data.error ||
        "Unable to initialize payment."
      );
    }


    if (!data.access_code) {
      throw new Error(
        "Paystack did not return an access code."
      );
    }


    /* ==============================================
       PAYSTACK SCRIPT CHECK
    ============================================== */

    if (
      typeof PaystackPop ===
      "undefined"
    ) {
      throw new Error(
        "Paystack script was not loaded. Check checkout.html."
      );
    }


    message.textContent =
      "Opening secure payment window...";


    /* ==============================================
       OPEN PAYSTACK
    ============================================== */

    const popup =
      new PaystackPop();


    popup.resumeTransaction(
      data.access_code
    );


    window.santianoPaystackReference =
      data.reference;


    window.santianoPaystackOrderId =
      order.id;


    /* ==============================================
       CHANGE BUTTON TO VERIFY
    ============================================== */

    button.textContent =
      "VERIFY PAYMENT";


    button.disabled = false;


    button.onclick = () => {
      verifyPayment(
        data.reference
      );
    };


    message.textContent =
      "After completing payment, click VERIFY PAYMENT.";


  } catch (error) {

    console.error(
      "Payment initialization error:",
      error
    );


    message.textContent =
      error.message ||
      "Unable to initialize payment.";


    button.disabled = false;


    button.textContent =
      `PAY ${checkoutMoney(
        order.total_kobo
      )}`;
  }
}


/* =====================================================
   VERIFY PAYMENT
===================================================== */

async function verifyPayment(
  reference
) {
  const message =
    document.getElementById(
      "checkoutMessage"
    );

  const button =
    document.getElementById(
      "payButton"
    );

  const token =
    getToken();


  if (!message || !button) {
    return;
  }


  if (!reference) {
    message.textContent =
      "No payment reference was found.";

    return;
  }


  if (!token) {
    window.location.href =
      "login.html";

    return;
  }


  button.disabled = true;

  button.textContent =
    "VERIFYING...";

  message.textContent =
    "Verifying your payment...";


  try {

    /* ==============================================
       VERIFY PAYMENT THROUGH BACKEND
    ============================================== */

    const response =
      await fetch(
        `${CHECKOUT_API}/orders/paystack/verify`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`
          },

          body:
            JSON.stringify({
              reference
            })
        }
      );


    let data;

    try {
      data = await response.json();
    } catch (jsonError) {
      throw new Error(
        "The payment server returned an invalid response."
      );
    }


    console.log(
      "Payment verification response:",
      data
    );


    if (!response.ok) {
      throw new Error(
        data.error ||
        "Payment verification failed."
      );
    }


    /* ==============================================
       PAYMENT SUCCESS
    ============================================== */

    message.textContent =
      "Payment successful. Your book is now available to download.";


    button.textContent =
      "PAYMENT SUCCESSFUL";


    button.disabled = true;


    /*
       Only clear checkout after the
       backend has successfully verified
       the payment.
    */

    clearCheckout();


    setTimeout(
      () => {
        window.location.href =
          "library.html";
      },
      1500
    );


  } catch (error) {

    console.error(
      "Payment verification error:",
      error
    );


    message.textContent =
      error.message ||
      "Payment verification failed.";


    button.disabled = false;


    button.textContent =
      "VERIFY PAYMENT";
  }
}


/* =====================================================
   START
===================================================== */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    renderCheckout();
  }
);