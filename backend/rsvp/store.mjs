// DynamoDB storage for RSVPs. One item per session in the existing TavernCalendar
// table: { date: "rsvp#YYYY-MM-DD", Danny: "yes", Fraser: "no", ..., updatedAt }.
// The AWS SDK v3 ships with the Node 22 Lambda runtime, so nothing is bundled.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export function dynamoStore(table, roster) {
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const pick = (item) => Object.fromEntries(roster.filter((p) => item?.[p]).map((p) => [p, item[p]]));

  return {
    async get(session) {
      const r = await doc.send(new GetCommand({ TableName: table, Key: { date: `rsvp#${session}` } }));
      return pick(r.Item);
    },
    async set(session, player, answer) {
      const base = {
        TableName: table,
        Key: { date: `rsvp#${session}` },
        ReturnValues: "ALL_NEW",
        ExpressionAttributeNames: { "#p": player, "#u": "updatedAt" },
      };
      const t = new Date().toISOString();
      const cmd = answer
        ? new UpdateCommand({ ...base, UpdateExpression: "SET #p = :a, #u = :t", ExpressionAttributeValues: { ":a": answer, ":t": t } })
        : new UpdateCommand({ ...base, UpdateExpression: "REMOVE #p SET #u = :t", ExpressionAttributeValues: { ":t": t } });
      const r = await doc.send(cmd);
      return pick(r.Attributes);
    },
  };
}
