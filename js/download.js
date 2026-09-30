/* =====================================================
   SANTIANO BOOKS — TEMPORARY DOWNLOAD PAGE
===================================================== */


/* =====================================================
   READ URL PARAMETERS
===================================================== */

const params =
  new URLSearchParams(
    window.location.search
  );


const downloadUrl =
  params.get("url");


const bookTitle =
  params.get("title") ||
  "Your Santiano Book";


const bookAuthor =
  params.get("author") ||
  "Santiano Books";


/*
   Absolute expiration timestamp
   returned by the backend.

   Example:
   1789740000000
*/

const expiresAt =
  Number(
    params.get("expires_at")
  );


/*
   Fallback for older links that may still
   contain ?expires=300
*/

const fallbackExpiresIn =
  Number(
    params.get("expires")
  ) || 300;


/* =====================================================
   ELEMENTS
===================================================== */

const bookTitleElement =
  document.getElementById(
    "bookTitle"
  );


const bookAuthorElement =
  document.getElementById(
    "bookAuthor"
  );


const timerElement =
  document.getElementById(
    "timer"
  );


const downloadButton =
  document.getElementById(
    "downloadButton"
  );


const downloadContent =
  document.getElementById(
    "downloadContent"
  );


const expiredContent =
  document.getElementById(
    "expiredContent"
  );


const errorContent =
  document.getElementById(
    "errorContent"
  );


const errorMessage =
  document.getElementById(
    "errorMessage"
  );


/* =====================================================
   DISPLAY BOOK INFORMATION
===================================================== */

bookTitleElement.textContent =
  bookTitle;


bookAuthorElement.textContent =
  bookAuthor;


/* =====================================================
   VALIDATE DOWNLOAD URL
===================================================== */

if (!downloadUrl) {

  showError(
    "This download link is missing or invalid."
  );

}


/* =====================================================
   SET SUPABASE DOWNLOAD URL
===================================================== */

if (downloadUrl) {

  downloadButton.href =
    downloadUrl;

}


/* =====================================================
   TIMER STATE
===================================================== */

let timerInterval =
  null;


/*
   Determine the actual expiration time.

   New links:
   Use expires_at returned by Render.

   Older links:
   Fall back to expires=300.
*/

let actualExpiresAt;


if (
  Number.isFinite(
    expiresAt
  ) &&
  expiresAt > 0
) {

  actualExpiresAt =
    expiresAt;

} else {

  actualExpiresAt =
    Date.now() +
    fallbackExpiresIn * 1000;

}


/* =====================================================
   FORMAT TIME
===================================================== */

function formatTime(
  totalSeconds
) {

  const safeSeconds =
    Math.max(
      0,
      Math.floor(
        totalSeconds
      )
    );


  const minutes =
    Math.floor(
      safeSeconds / 60
    );


  const seconds =
    safeSeconds % 60;


  return (
    String(minutes)
      .padStart(2, "0") +
    ":" +
    String(seconds)
      .padStart(2, "0")
  );

}


/* =====================================================
   GET REMAINING TIME
===================================================== */

function getRemainingSeconds() {

  const remainingMilliseconds =
    actualExpiresAt -
    Date.now();


  return Math.max(
    0,
    Math.ceil(
      remainingMilliseconds /
      1000
    )
  );

}


/* =====================================================
   UPDATE TIMER
===================================================== */

function updateTimer() {

  const remainingSeconds =
    getRemainingSeconds();


  timerElement.textContent =
    formatTime(
      remainingSeconds
    );


  /*
     The temporary URL has expired.
  */

  if (
    remainingSeconds <= 0
  ) {

    expireDownload();

    return;

  }

}


/* =====================================================
   EXPIRE DOWNLOAD
===================================================== */

function expireDownload() {

  if (timerInterval) {

    clearInterval(
      timerInterval
    );

    timerInterval =
      null;

  }


  timerElement.textContent =
    "00:00";


  /*
     Disable download button.
  */

  downloadButton.classList.add(
    "disabled"
  );


  downloadButton.removeAttribute(
    "href"
  );


  downloadButton.textContent =
    "LINK EXPIRED";


  /*
     Hide active download content.
  */

  downloadContent.classList.add(
    "hide"
  );


  /*
     Show expired message.
  */

  expiredContent.classList.add(
    "show"
  );

}


/* =====================================================
   SHOW ERROR
===================================================== */

function showError(
  message
) {

  if (timerInterval) {

    clearInterval(
      timerInterval
    );

    timerInterval =
      null;

  }


  downloadContent.classList.add(
    "hide"
  );


  expiredContent.classList.remove(
    "show"
  );


  errorMessage.textContent =
    message;


  errorContent.classList.add(
    "show"
  );

}


/* =====================================================
   START TIMER
===================================================== */

if (
  downloadUrl
) {

  /*
     Check immediately.
  */

  updateTimer();


  /*
     Keep countdown synchronized with
     the real expiration timestamp.
  */

  if (
    getRemainingSeconds() > 0
  ) {

    timerInterval =
      setInterval(
        updateTimer,
        1000
      );

  }

}