import { NextRequest } from "next/server";
import { isLibraryDirKey, resolveLibraryFile } from "@/lib/paths";
import { streamVideoFile } from "@/lib/stream";

/** Range-aware streaming of a library video. */
export async function GET(req: NextRequest) {
  const dir = req.nextUrl.searchParams.get("dir") ?? "";
  const name = req.nextUrl.searchParams.get("name") ?? "";
  if (!isLibraryDirKey(dir)) return new Response("bad dir", { status: 400 });

  let file: string;
  try {
    file = resolveLibraryFile(dir, name);
  } catch {
    return new Response("bad name", { status: 400 });
  }
  return streamVideoFile(file, req.headers.get("range"));
}
