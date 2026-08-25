import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://djuqnhqedykhectfhzba.supabase.co";

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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1. Ensure bucket exists and is public
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) console.warn("List buckets warning:", listError.message);
    const bucketExists = buckets?.some((b) => b.name === BUCKET_NAME || b.id === BUCKET_NAME);

    if (!bucketExists) {
      console.log(`Creating public bucket '${BUCKET_NAME}'...`);
      const { data: created, error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
      });
      if (createError) {
        console.error("Create bucket error:", createError.message);
      } else {
        console.log("Bucket created successfully:", created);
      }
    }
  } catch (err) {
    console.warn("Bucket check warning:", err.message);
  }

  // 2. Read and upload file
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(targetFileName).toLowerCase();
  let contentType = "application/octet-stream";
  if (ext === ".apk") contentType = "application/vnd.android.package-archive";
  if (ext === ".ipa") contentType = "application/octet-stream";
  if (ext === ".zip") contentType = "application/zip";

  console.log(`Uploading ${targetFileName} (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB) to Supabase Storage '${BUCKET_NAME}'...`);

  const { data, error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(targetFileName, fileBuffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    console.error("Upload error:", uploadError.message || uploadError);
    process.exit(1);
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(targetFileName);
  console.log("✓ Upload successful!");
  console.log("Direct Public Download URL:", publicUrlData.publicUrl);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
