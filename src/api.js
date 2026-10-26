
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const API_KEY = import.meta.env.VITE_API_KEY || "";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
      ...options.headers,
    },
  });

  const text = await response.text();

  const data = (() => {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  })();

  if (!response.ok) {
    const messages = {
      400: "Some details are invalid. Please check them and try again.",
      401: "The API rejected the request. Check the API configuration.",
      404: "The requested appointment or booking could not be found.",
      409: "This appointment is no longer available or its status has changed.",
      422: "This retry does not match the original booking request.",
      429: "Too many attempts. Please wait before trying again.",
      500: "The server encountered an error. Please try again shortly.",
      502: "The booking service is temporarily unavailable.",
      503: "The booking service is temporarily unavailable.",
      504: "The booking service took too long to respond.",
    };

    const error = new Error(
      messages[response.status] ||
        (response.status >= 500
          ? "The booking service encountered an error. Please try again shortly."
          : data?.error || `Request failed with status ${response.status}`)
    );

    error.status = response.status;
    error.retryAfter = response.headers.get("Retry-After");
    throw error;
  }

  return data;
}

export const clinicApi = {
  async getSlots(provider = "") {
    const query = provider
      ? `?provider=${encodeURIComponent(provider)}`
      : "";

    const data = await request(`/slots${query}`);
    return data.slots || [];
  },

  async bookAppointment(booking, idempotencyKey) {
    return request("/bookings", {
      method: "POST",
      headers: idempotencyKey
        ? { "Idempotency-Key": idempotencyKey }
        : {},
      body: JSON.stringify(booking),
    });
  },

  async getBooking(id) {
    return request(`/bookings/${encodeURIComponent(id)}`);
  },

  async getBookings(email, limit = 10, cursor = "") {
    const params = new URLSearchParams({
      email,
      limit: String(limit),
    });

    if (cursor) params.set("cursor", cursor);

    return request(`/bookings?${params.toString()}`);
  },

  async cancelBooking(id) {
    return request(`/bookings/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};
