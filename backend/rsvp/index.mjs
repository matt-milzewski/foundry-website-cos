// RSVP API for the next-session banner, served by the calendarHandler Lambda
// behind the TavernCalendarAPI HTTP API.
//   GET /rsvp?session=YYYY-MM-DD           -> { session, answers }
//   PUT /rsvp {session, player, answer}    -> { session, answers }
// The old /notes calendar routes answer 410 Gone.

import { validateSession, validatePut } from "./validate.mjs";

const MAX_BODY = 1024;

const json = (statusCode, obj) => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(obj),
});

export function createHandler({ store, roster, now = () => new Date() }) {
  return async (event) => {
    const route = event.routeKey || "";

    if (route.endsWith(" /notes")) return json(410, { error: "The old calendar has been retired" });

    if (route === "GET /rsvp") {
      const session = validateSession(event.queryStringParameters?.session, now());
      if (!session) return json(400, { error: "Invalid session date" });
      return json(200, { session, answers: await store.get(session) });
    }

    if (route === "PUT /rsvp") {
      let raw = event.body || "";
      if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
      if (raw.length > MAX_BODY) return json(400, { error: "Body too large" });
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return json(400, { error: "Body must be JSON" });
      }
      const v = validatePut(body, roster, now());
      if (!v.ok) return json(400, { error: v.error });
      const { session, player, answer } = v.value;
      const answers = await store.set(session, player, answer === "clear" ? null : answer);
      return json(200, { session, answers });
    }

    return json(404, { error: "Not found" });
  };
}

let lambdaHandler;

export const handler = async (event) => {
  if (!lambdaHandler) {
    const { dynamoStore } = await import("./store.mjs");
    const roster = (process.env.PLAYERS || "").split(",").map((s) => s.trim()).filter(Boolean);
    lambdaHandler = createHandler({ store: dynamoStore(process.env.TABLE || "TavernCalendar", roster), roster });
  }
  try {
    return await lambdaHandler(event);
  } catch (err) {
    console.error(err);
    return json(500, { error: "Something went wrong" });
  }
};
