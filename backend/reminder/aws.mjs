// AWS wiring for the reminder job: the published schedule, RSVPs and send-state in
// DynamoDB, players' email addresses in SSM Parameter Store, and email through SES.
// The AWS SDK v3 ships with the Node 22 Lambda runtime, so nothing is bundled.
//
// Send-state lives next to the RSVPs in TavernCalendar:
//   { date: "reminder#YYYY-MM-DD", liveAt, firstEmail: "everyone" | "48h", firstEmailAt, finalEmailAt,
//     nudge_first_<Player>, nudge_second_<Player> }
// Players' addresses are a SecureString JSON object, e.g. {"Danny": "..."}, so they never
// appear in this public repo or on the site.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

export async function fetchSchedule(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Couldn't load the schedule (${res.status}) from ${url}`);
  const schedule = await res.json();
  if (!schedule?.regular || !Array.isArray(schedule.players)) throw new Error("The schedule is missing regular or players");
  return schedule;
}

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/** @returns {Promise<Record<string, string>>} player name -> email; empty if the parameter isn't set */
export async function ssmContacts(name) {
  if (!name) return {};
  try {
    const r = await new SSMClient({}).send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    const parsed = JSON.parse(r.Parameter.Value);
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "string" && EMAIL.test(v)));
  } catch (err) {
    if (err.name === "ParameterNotFound") return {};
    throw err;
  }
}

const NUDGE = /^nudge_(first|second)_(.+)$/;
const nudgeAttr = (kind, player) => `nudge_${kind}_${player}`;

export function dynamoReminderStore(table) {
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const get = async (key) => (await doc.send(new GetCommand({ TableName: table, Key: { date: key } }))).Item || {};
  const update = (session, params) =>
    doc.send(new UpdateCommand({ TableName: table, Key: { date: `reminder#${session}` }, ...params }));
  const claimed = async (promise) => {
    try {
      await promise;
      return true;
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") return false;
      throw err;
    }
  };

  return {
    getAnswers: (session) => get(`rsvp#${session}`),

    async getState(session) {
      const item = await get(`reminder#${session}`);
      const nudges = {};
      for (const [key, value] of Object.entries(item)) {
        const m = NUDGE.exec(key);
        if (m) (nudges[m[2]] ||= {})[m[1]] = value;
      }
      return { first: item.firstEmail, final: Boolean(item.finalEmailAt), liveAt: item.liveAt, nudges };
    },

    /** Records when this session first became "next" and returns the stored time. */
    async markLive(session, when) {
      const r = await update(session, {
        UpdateExpression: "SET #live = if_not_exists(#live, :t)",
        ExpressionAttributeNames: { "#live": "liveAt" },
        ExpressionAttributeValues: { ":t": when },
        ReturnValues: "UPDATED_NEW",
      });
      return r.Attributes.liveAt;
    },

    claim(session, kind) {
      const t = new Date().toISOString();
      return claimed(
        update(
          session,
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
              }
        )
      );
    },

    async release(session, kind) {
      await update(
        session,
        kind === "final"
          ? { UpdateExpression: "REMOVE #fin", ExpressionAttributeNames: { "#fin": "finalEmailAt" } }
          : { UpdateExpression: "REMOVE #first, #at", ExpressionAttributeNames: { "#first": "firstEmail", "#at": "firstEmailAt" } }
      );
    },

    claimNudge(session, player, kind, when) {
      return claimed(
        update(session, {
          UpdateExpression: "SET #n = :t",
          ConditionExpression: "attribute_not_exists(#n)",
          ExpressionAttributeNames: { "#n": nudgeAttr(kind, player) },
          ExpressionAttributeValues: { ":t": when.toISOString() },
        })
      );
    },

    async releaseNudge(session, player, kind) {
      await update(session, { UpdateExpression: "REMOVE #n", ExpressionAttributeNames: { "#n": nudgeAttr(kind, player) } });
    },
  };
}

let ses;

export function sesSender({ from, to, replyTo }) {
  if (!from || !to) throw new Error("FROM and TO must be set");
  ses ||= new SESv2Client({});
  const part = (Data) => ({ Data, Charset: "UTF-8" });
  return ({ subject, text, html }) =>
    ses.send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [to] },
        ...(replyTo && { ReplyToAddresses: [replyTo] }),
        Content: { Simple: { Subject: part(subject), Body: { Text: part(text), Html: part(html) } } },
      })
    );
}
