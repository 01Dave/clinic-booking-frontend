
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const API_KEY = import.meta.env.VITE_API_KEY || "";

async function request(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error("Configure VITE_API_BASE_URL in your .env file.");
  }

  if (!API_KEY) {
    throw new Error("Configure VITE_API_KEY in your .env file.");
  }

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
    const error = new Error(
      data?.error || `Request failed with status ${response.status}`
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
