import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { Checkpoint, CheckpointStore } from "./contracts.js";

export interface DocumentClientLike {
  send(command: unknown): Promise<unknown>;
}

export class DynamoCheckpointStore implements CheckpointStore {
  constructor(
    private readonly tableName: string,
    private readonly client: DocumentClientLike,
  ) {
    if (!tableName) throw new Error("DYNAMODB_CHECKPOINTS_TABLE is required.");
  }

  async save(checkpoint: Checkpoint): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: this.tableName,
      Item: checkpoint,
      ConditionExpression: "attribute_not_exists(spaceId) AND attribute_not_exists(id)",
    }));
  }

  async list(spaceId: string): Promise<Checkpoint[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: "spaceId = :spaceId",
      ExpressionAttributeValues: { ":spaceId": spaceId },
      ScanIndexForward: false,
    })) as { Items?: Checkpoint[] };
    return result.Items ?? [];
  }

  async get(spaceId: string, checkpointId: string): Promise<Checkpoint | undefined> {
    const result = await this.client.send(new GetCommand({
      TableName: this.tableName,
      Key: { spaceId, id: checkpointId },
    })) as { Item?: Checkpoint };
    return result.Item;
  }
}

export function createDynamoCheckpointStoreFromEnv(env: NodeJS.ProcessEnv = process.env): DynamoCheckpointStore {
  const tableName = env.DYNAMODB_CHECKPOINTS_TABLE;
  if (!tableName) throw new Error("DYNAMODB_CHECKPOINTS_TABLE is required.");
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? "us-east-1",
  }));
  return new DynamoCheckpointStore(tableName, client);
}
