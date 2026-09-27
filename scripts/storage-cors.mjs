// Allows the browser to PUT/GET attachments with presigned URLs. Run: node scripts/storage-cors.mjs
import { config } from "dotenv";
import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

config({ path: ".env.local" });
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
  forcePathStyle: true,
});
const Bucket = process.env.S3_BUCKET ?? "attachments";
// Presigned URLs carry their own signature, so any origin may use them.
await s3.send(
  new PutBucketCorsCommand({
    Bucket,
    CORSConfiguration: {
      CORSRules: [{ AllowedOrigins: ["*"], AllowedMethods: ["GET", "PUT", "HEAD"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600 }],
    },
  }),
);
console.log(JSON.stringify((await s3.send(new GetBucketCorsCommand({ Bucket }))).CORSRules));
