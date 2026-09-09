import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";

async function main() {
  const tableName = process.env.DYNAMODB_CHECKPOINTS_TABLE;
  if (!tableName) throw new Error("DYNAMODB_CHECKPOINTS_TABLE is required.");

  const client = new DynamoDBClient({
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
  });

  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`Checkpoint table ready: ${tableName}`);
    return;
  } catch (error) {
    if ((error as { name?: string }).name !== "ResourceNotFoundException") throw error;
  }

  await client.send(new CreateTableCommand({
    TableName: tableName,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "spaceId", AttributeType: "S" },
      { AttributeName: "id", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "spaceId", KeyType: "HASH" },
      { AttributeName: "id", KeyType: "RANGE" },
    ],
  }));

  console.log(`Checkpoint table creation requested: ${tableName}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Checkpoint table setup failed.");
  process.exitCode = 1;
});
