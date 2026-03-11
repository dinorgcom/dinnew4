import { put } from "@vercel/blob";
import { env } from "@/lib/env";

type UploadInput = {
  pathname: string;
  body: Blob | Buffer | ReadableStream;
  contentType?: string;
};

export async function uploadBlob({ pathname, body, contentType }: UploadInput) {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
  }

  return put(pathname, body, {
    access: "public",
    contentType,
    token: env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: true,
  });
}
