import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../env";

export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalDriver implements StorageDriver {
  readonly name = "local";
  private root = path.resolve(env().STORAGE_LOCAL_DIR);
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, body: Buffer) {
    const p = this.resolve(key);
    await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
    await fs.writeFile(p, body, { mode: 0o600 });
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

class S3Driver implements StorageDriver {
  readonly name = "s3";
  private client: S3Client;
  private bucket: string;
  constructor() {
    const e = env();
    if (!e.S3_BUCKET) throw new Error("S3_BUCKET is required for STORAGE_DRIVER=s3");
    this.bucket = e.S3_BUCKET;
    this.client = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials: e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY } : undefined,
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256" }));
  }
  async get(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (!driver) driver = env().STORAGE_DRIVER === "s3" ? new S3Driver() : new LocalDriver();
  return driver;
}
