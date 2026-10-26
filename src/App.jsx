
import { useCallback, useEffect, useRef, useState } from "react";
import { clinicApi } from "./api";
import "./App.css";

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-NG", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateTime(value) {
  return `${formatDate(value)} at ${formatTime(value)}`;
}

function makeIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function App() {
  const [slots, setSlots] = useState([]);
  const [provider, setProvider] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const pendingBookingRef = useRef(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [referenceCopied, setReferenceCopied] = useState(false);
  const [copyReferenceError, setCopyReferenceError] = useState("");
  

  const [lookupEmail, setLookupEmail] = useState("");
  const [bookings, setBookings] = useState([]);
  const [nextCursor, setNextCursor] = useState("");
  const [currentCursor, setCurrentCursor] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [cancellingId, setCancellingId] = useState("");

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await clinicApi.getSlots();
      setSlots(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err.message || "Could not load appointments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function fetchSlots() {
      try {
        const result = await clinicApi.getSlots();

        if (active) {
          setSlots(Array.isArray(result) ? result : []);
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Could not load appointments.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchSlots();

    return () => {
      active = false;
    };
  }, []);

  const providers = [
    ...new Set(slots.map((slot) => slot.provider).filter(Boolean)),
  ];

  const now = useState(() => Date.now())[0];

  const visibleSlots = slots.filter((slot) => {
    const isFuture = new Date(slot.start).getTime() > now;
    const matchesProvider =
      provider === "all" || slot.provider === provider;

    return isFuture && slot.available && matchesProvider;
  });

  async function handleCopyReference() {
  if (!confirmation?.id) return;

  setCopyReferenceError("");

  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard access is unavailable.");
    }

    await navigator.clipboard.writeText(String(confirmation.id));
    setReferenceCopied(true);
  } catch {
    setReferenceCopied(false);
    setCopyReferenceError(
      "Copying isn't available in this browser. Please select and copy the reference manually."
    );
  }
}
  
  async function handleBooking(event) {
    event.preventDefault();
    setBookingError("");

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || !cleanEmail) {
      setBookingError("Please enter your name and email address.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setBookingError("Please enter a valid email address.");
      return;
    }

    setBookingLoading(true);

const bookingPayload = {
  slot_id: selectedSlot.id,
  name: cleanName,
  email: cleanEmail,
};

const fingerprint = JSON.stringify(bookingPayload);

if (
  !pendingBookingRef.current ||
  pendingBookingRef.current.fingerprint !== fingerprint
) {
  pendingBookingRef.current = {
    fingerprint,
    key: makeIdempotencyKey(),
  };
}

try {
  const booking = await clinicApi.bookAppointment(
    bookingPayload,
    pendingBookingRef.current.key
  );

  pendingBookingRef.current = null;

      setReferenceCopied(false);
      setCopyReferenceError("");
      setConfirmation({
        ...booking,
        provider: selectedSlot.provider,
        start: selectedSlot.start,
        end: selectedSlot.end,
      });

      setSelectedSlot(null);
      setName("");
      setEmail("");
      await loadSlots();
    } catch (err) {
      setBookingError(
        err.status === 409
          ? "This appointment was just booked by someone else. Please choose another slot."
          : err.message || "Booking failed. Please try again."
      );
      await loadSlots();
    } finally {
      setBookingLoading(false);
    }
  }

  
  async function searchBookings(event, cursor = "") {
    event?.preventDefault();
    setLookupError("");

    const cleanEmail = lookupEmail.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setLookupError("Enter a valid email address to find your bookings.");
      return;
    }

    setLookupLoading(true);

    try {
      const result = await clinicApi.getBookings(cleanEmail, 10, cursor);
      const pageBookings = Array.isArray(result)
        ? result
        : result.bookings || [];

      setBookings((previous) =>
        cursor ? [...previous, ...pageBookings] : pageBookings
      );

      setNextCursor(
        Array.isArray(result)
          ? ""
          : result.next_cursor || result.nextCursor || ""
      );
      setCurrentCursor(cursor);
    } catch (err) {
      if (err.status === 429) {
        const wait = Number(err.retryAfter);

        setLookupError(
          Number.isFinite(wait) && wait > 0
            ? `Too many requests. Please wait ${wait} seconds before searching again.`
            : "Too many requests. Please wait before searching again."
        );
      } else if (err.status === 401) {
        setLookupError(
          "The API rejected the request. Please check the API configuration."
        );
      } else if (err.status >= 500) {
        setLookupError(
          "The booking service is temporarily unavailable. Please try again shortly."
        );
      } else {
        setLookupError(
          err.message || "Could not find your bookings. Please try again."
        );
      }

      // Keep previously loaded bookings if a later page fails.
      if (!cursor) {
        setBookings([]);
        setNextCursor("");
      }
    } finally {
      setLookupLoading(false);
    }
  }


  async function cancelBooking(id) {
    if (!window.confirm("Are you sure you want to cancel this appointment?")) {
      return;
    }

    setCancellingId(id);
    setLookupError("");

    try {
      await clinicApi.cancelBooking(id);
      await searchBookings(null, currentCursor);
      await loadSlots();
    } catch (err) {
  if (err.status === 404) {
    setLookupError(
      "This booking could not be found. Refresh your booking list."
    );
  } else if (err.status === 409) {
    setLookupError(
      "This booking has already been cancelled or its status has changed."
    );
  } else if (err.status === 429) {
    const wait = Number(err.retryAfter);

    setLookupError(
      Number.isFinite(wait) && wait > 0
        ? `Too many requests. Please wait ${wait} seconds before trying again.`
        : "Too many requests. Please wait before trying again."
    );
  } else if (err.status >= 500) {
    setLookupError(
      "The booking service is temporarily unavailable. Please try again."
    );
  } else {
    setLookupError(
      err.message || "Could not cancel this appointment. Please try again."
    );
  }
} finally {
  setCancellingId("");
}
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Carepoint home">
          <span className="brand-mark">+</span>
          <span>carepoint</span>
        </a>

        <nav className="nav-links">
          <a href="#appointments">Appointments</a>
          <a href="#manage-bookings">My bookings</a>
          <a href="#about">About</a>
        </nav>

        <a className="nav-cta" href="#appointments">
          Find a slot <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" /> YOUR HEALTH, OUR PRIORITY
          </p>
          <h1>
            Healthcare that
            <br />
            fits <span>your life.</span>
          </h1>
          <p className="hero-description">
            Book your next clinic visit in just a few clicks.
            Browse available times and find the care you need.
          </p>
          <a className="primary-button" href="#appointments">
            Book an appointment <span aria-hidden="true">→</span>
          </a>
          <div className="hero-note">
            <span className="note-check">✓</span>
            Simple booking. Care you can count on.
          </div>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div className="art-circle">
            <div className="art-cross">+</div>
            <div className="doctor">
              <div className="doctor-hair" />
              <div className="doctor-face">
                <div className="doctor-eyes" />
                <div className="doctor-smile" />
              </div>
              <div className="doctor-neck" />
              <div className="doctor-coat">
                <div className="coat-shirt" />
                <div className="coat-pocket" />
                <div className="coat-stethoscope" />
              </div>
            </div>
          </div>
          <div className="art-card">
            <span className="art-card-icon">✓</span>
            <span>
              <strong>Care made simple</strong>
              <small>Your next visit, sorted.</small>
            </span>
          </div>
        </div>
      </section>

      <section className="appointments" id="appointments">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TAKE THE NEXT STEP</p>
            <h2>Find your appointment</h2>
            <p className="section-description">
              Choose a convenient time from the available appointments.
            </p>
          </div>
          <button
            className="refresh-button"
            type="button"
            onClick={loadSlots}
            disabled={loading}
          >
            <span aria-hidden="true">↻</span> Refresh
          </button>
        </div>

        <div className="filter-row">
          <label htmlFor="provider-filter">Filter by provider</label>
          <select
            id="provider-filter"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
          >
            <option value="all">All providers</option>
            {providers.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <span className="slot-count">{visibleSlots.length} available</span>
        </div>

        {error && (
          <div className="notice notice-error" role="alert">
            <strong>Couldn't load appointments.</strong>
            <p>{error}</p>
            <button type="button" onClick={loadSlots}>Try again</button>
          </div>
        )}

        {loading ? (
          <div className="empty-state">
            <div className="loader" />
            <p>Finding available appointments…</p>
          </div>
        ) : !error && visibleSlots.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">▦</div>
            <h3>No available appointments yet</h3>
            <p>Try refreshing later or choosing another provider.</p>
          </div>
        ) : (
          <div className="slot-grid">
            {visibleSlots.map((slot) => (
              <article className="slot-card" key={slot.id}>
                <div className="slot-card-top">
                  <span className="provider-avatar">
                    {(slot.provider || "C").charAt(0).toUpperCase()}
                  </span>
                  <span className="available-badge">
                    <span className="status-dot" /> Available
                  </span>
                </div>
                <p className="slot-provider">{slot.provider || "Clinic provider"}</p>
                <h3>{formatDate(slot.start)}</h3>
                <p className="slot-time">
                  {formatTime(slot.start)} – {formatTime(slot.end)}
                </p>
                <button
                  className="slot-book-button"
                  type="button"
                  onClick={() => {
                    setSelectedSlot(slot);
                    setBookingError("");
                  }}
                >
                  Choose appointment <span aria-hidden="true">→</span>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="manage-section" id="manage-bookings">
        <div className="manage-heading">
          <p className="eyebrow">YOUR APPOINTMENTS</p>
          <h2>Manage your bookings</h2>
          <p>Enter the email address used when booking to find or cancel an appointment.</p>
        </div>

        <form className="lookup-form" onSubmit={(event) => searchBookings(event)}>
          <label htmlFor="lookup-email">Email address</label>
          <div className="lookup-controls">
            <input
              id="lookup-email"
              type="email"
              value={lookupEmail}
              onChange={(event) => setLookupEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
            <button className="primary-button" type="submit" disabled={lookupLoading}>
              {lookupLoading ? "Searching…" : "Find bookings"}
            </button>
          </div>
        </form>

        {lookupError && <div className="notice notice-error" role="alert">{lookupError}</div>}

        {bookings.length > 0 && (
          <div className="booking-list">
            {bookings.map((booking) => (
              <article className="booking-row" key={booking.id}>
                <div className="booking-info">
                  <strong>{booking.name}</strong>
                  <span>{booking.email}</span>
                  <small>Booking ID: {booking.id}</small>
                  <span className={`booking-status status-${booking.status}`}>
                    {booking.status}
                  </span>
                </div>
                {booking.status !== "cancelled" && (
                  <button
                    className="cancel-button"
                    type="button"
                    disabled={cancellingId === booking.id}
                    onClick={() => cancelBooking(booking.id)}
                  >
                    {cancellingId === booking.id ? "Cancelling…" : "Cancel booking"}
                  </button>
                )}
              </article>
            ))}
            {nextCursor && (
              <button
                className="refresh-button"
                type="button"
                disabled={lookupLoading}
                onClick={() => searchBookings(null, nextCursor)}
              >
                Load more bookings
              </button>
            )}
          </div>
        )}
      </section>

      <section className="about-strip" id="about">
        <div>
          <span className="about-icon">♡</span>
          <h3>Care around your schedule</h3>
          <p>Find a time that works for you.</p>
        </div>
        <div>
          <span className="about-icon">✓</span>
          <h3>Simple and straightforward</h3>
          <p>Book with just your basic details.</p>
        </div>
        <div>
          <span className="about-icon">+</span>
          <h3>Focused on your wellbeing</h3>
          <p>Your next step towards better care.</p>
        </div>
      </section>

      <footer className="footer">
        <a className="brand footer-brand" href="/">
          <span className="brand-mark">+</span><span>carepoint</span>
        </a>
        <p>Making your next appointment simpler.</p>
        <span>© {new Date().getFullYear()} Carepoint</span>
      </footer>

      {selectedSlot && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !bookingLoading) {
              setSelectedSlot(null);
            }
          }}
        >
          <section
            className="booking-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-title"
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => !bookingLoading && setSelectedSlot(null)}
              aria-label="Close"
              disabled={bookingLoading}
            >
              ×
            </button>

            <p className="eyebrow">YOUR NEXT VISIT</p>
            <h2 id="booking-title">Book an appointment</h2>
            <div className="selected-summary">
              <strong>{selectedSlot.provider || "Clinic provider"}</strong>
              <span>{formatDateTime(selectedSlot.start)}</span>
              <span>Ends at {formatTime(selectedSlot.end)}</span>
            </div>

            <form className="booking-form" onSubmit={handleBooking}>
              <label htmlFor="patient-name">Full name</label>
              <input
                id="patient-name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your full name"
                required
                maxLength={120}
              />

              <label htmlFor="patient-email">Email address</label>
              <input
                id="patient-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                maxLength={254}
              />

              {bookingError && (
                <div className="notice notice-error" role="alert">{bookingError}</div>
              )}

              <button className="primary-button modal-action" type="submit" disabled={bookingLoading}>
                {bookingLoading ? "Confirming…" : "Confirm appointment"}
              </button>
            </form>
            <p className="modal-footnote">Please check your details before confirming.</p>
          </section>
        </div>
      )}

      {confirmation && (
  <div className="modal-backdrop">
    <section
      className="booking-modal confirmation-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-title"
      aria-describedby="confirmation-description"
    >
      <div className="confirmation-check" aria-hidden="true">
        ✓
      </div>

      <p className="eyebrow">BOOKING RECEIVED</p>
      <h2 id="confirmation-title">You're all set!</h2>

      <p id="confirmation-description" className="confirmation-description">
        Your appointment booking has been submitted successfully.
      </p>

      <div className="selected-summary confirmation-summary">
        <span className="confirmation-label">PROVIDER</span>
        <strong>{confirmation.provider || "Clinic provider"}</strong>

        <span className="confirmation-label">DATE AND TIME</span>
        <strong>
          {confirmation.start
            ? formatDateTime(confirmation.start)
            : `Slot: ${confirmation.slot_id}`}
        </strong>

        {confirmation.end && (
          <>
            <span className="confirmation-label">END TIME</span>
            <strong>{formatDateTime(confirmation.end)}</strong>
          </>
        )}

        <span className="confirmation-label">PATIENT</span>
        <strong>{confirmation.name}</strong>
        <span>{confirmation.email}</span>

        {confirmation.status && (
          <div className="confirmation-status">
            <span>Status</span>
            <strong>{confirmation.status}</strong>
          </div>
        )}
      </div>

      {confirmation.id && (
        <div className="reference-panel">
          <span className="confirmation-label">BOOKING REFERENCE</span>

          <div className="reference-value-row">
            <code className="reference-value">{confirmation.id}</code>

            <button
              className="copy-reference-button"
              type="button"
              onClick={handleCopyReference}
            >
              {referenceCopied ? "Copied!" : "Copy reference"}
            </button>
          </div>

          <p className="reference-help">
            Keep this reference in case you need to check your appointment.
          </p>

          <p className="copy-feedback" aria-live="polite" role="status">
            {referenceCopied
              ? "Booking reference copied to clipboard."
              : copyReferenceError}
          </p>
        </div>
      )}

      <button
        className="primary-button modal-action"
        type="button"
        onClick={() => {
          setConfirmation(null);
          setReferenceCopied(false);
          setCopyReferenceError("");
        }}
      >
        Done
      </button>
    </section>
  </div>
)}
    </main>
  );
}

export default App;
