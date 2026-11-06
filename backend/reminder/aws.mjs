// AWS wiring for the reminder job: the published schedule, RSVPs and send-state in
// DynamoDB, and email through SES. The AWS SDK v3 ships with the Node 22 Lambda
// runtime, so nothing is bundled.
//
// Send-state lives next to the RSVPs in TavernCalendar:
//   { date: "reminder#YYYY-MM-DD", firstEmail: "everyone" | "48h", firstEmailAt, finalEmailAt }

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

export async function fetchSchedule(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Couldn't load the schedule (${res.status}) from ${url}`);
  const schedule = await res.json();
  if (!schedule?.regular || !Array.isArray(schedule.players)) throw new Error("The schedule is missing regular or players");
  return schedule;
}

export function dynamoReminderStore(table) {
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const get = async (key) => (await doc.send(new GetCommand({ TableName: table, Key: { date: key } }))).Item || {};
  const update = (session, params) =>
    doc.send(new UpdateCommand({ TableName: table, Key: { date: `reminder#${session}` }, ...params }));

  return {
    getAnswers: (session) => get(`rsvp#${session}`),

    async getState(session) {
      const item = await get(`reminder#${session}`);
      return { first: item.firstEmail, final: Boolean(item.finalEmailAt) };
    },

    async claim(session, kind) {
      const t = new Date().toISOString();
      const params =
        kind === "final"
          ? {
              UpdateExpression: "SET #fin = :t",
              ConditionExpression: "#first = :h AND attribute_not_exists(#fin)",
              ExpressionAttributeNames: { "#first": "firstEmail", "#fin": "finalEmailAt" },
              ExpressionAttributeValues: { ":t": t, ":h": "48h" },
            }
          : {
              UpdateExpression: "SET #first = :k, #at = :t",
              ConditionExpression: "attribute_not_exists(#first)",
              ExpressionAttributeNames: { "#first": "firstEmail", "#at": "firstEmailAt" },
              ExpressionAttributeValues: { ":k": kind, ":t": t },
            };
      try {
        await update(session, params);
        return true;
      } catch (err) {
        if (err.name === "ConditionalCheckFailedException") return false;
        throw err;
      }
    },

    async release(session, kind) {
      await update(
        session,
        kind === "final"
          ? { UpdateExpression: "REMOVE #fin", ExpressionAttributeNames: { "#fin": "finalEmailAt" } }
          : { UpdateExpression: "REMOVE #first, #at", ExpressionAttributeNames: { "#first": "firstEmail", "#at": "firstEmailAt" } }
      );
    },
  };
}

export function sesSender({ from, to }) {
  if (!from || !to) throw new Error("FROM and TO must be set");
  const ses = new SESv2Client({});
  const part = (Data) => ({ Data, Charset: "UTF-8" });
  return ({ subject, text, html }) =>
    ses.send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [to] },
        Content: { Simple: { Subject: part(subject), Body: { Text: part(text), Html: part(html) } } },
      })
    );
}
