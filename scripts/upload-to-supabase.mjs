import fs from "node:fs";
import path from "node:path";

const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://djuqnhqedykhectfhzba.supabase.co"
).replace(/\/$/, "");

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqdXFuaHFlZHlraGVjdGZoemJhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzYzMzE3NywiZXhwIjoyMTAzMjA5MTc3fQ.-3pFyBLu28GY1zlWd2yNQp2V4s8qH3ia-BQ_9HwePJk";

const BUCKET_NAME = "builds";

async function main() {
  const filePath = process.argv[2];
  const targetFileName = process.argv[3] || (filePath ? path.basename(filePath) : null);

  if (!filePath || !fs.existsSync(filePath)) {
    console.error("Usage: node upload-to-supabase.mjs <filePath> [targetFileName]");
    console.error("Provided path:", filePath);
    process.exit(1);
  }

  // 1. Ensure bucket exists and is public via REST API (Zero external dependencies)
  try {
    const listRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (listRes.ok) {
      const buckets = await listRes.json();
      const exists = buckets.some((b) => b.name === BUCKET_NAME || b.id === BUCKET_NAME);

      if (!exists) {
        console.log(`Creating public bucket '${BUCKET_NAME}'...`);
        await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: BUCKET_NAME,
            name: BUCKET_NAME,
            public: true,
          }),
        });
      }
    }
  } catch (err) {
    console.warn("Bucket check warning:", err.message);
  }

  // 2. Read and upload file via REST API
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(targetFileName).toLowerCase();
  let contentType = "application/octet-stream";
  if (ext === ".apk") contentType = "application/vnd.android.package-archive";
  if (ext === ".ipa") contentType = "application/octet-stream";
  if (ext === ".zip") contentType = "application/zip";

  console.log(
    `Uploading ${targetFileName} (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB) to Supabase Storage '${BUCKET_NAME}'...`
  );

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${encodeURIComponent(targetFileName)}`;
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    console.error(`Upload failed (status ${uploadRes.status}):`, errorText);
    process.exit(1);
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${encodeURIComponent(targetFileName)}`;
  console.log("✓ Upload successful!");
  console.log("Direct Public Download URL:", publicUrl);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
