import { NextRequest } from "next/server";
import { assertSlotUuid, slotPath } from "@/lib/slots";
import { streamVideoFile } from "@/lib/stream";

/** Range-aware streaming of the video currently inside an aerial slot. */
export async function GET(req: NextRequest) {
  let file: string;
  try {
    file = slotPath(assertSlotUuid(req.nextUrl.searchParams.get("uuid") ?? ""));
  } catch {
    return new Response("bad uuid", { status: 400 });
  }
  return streamVideoFile(file, req.headers.get("range"));
}
