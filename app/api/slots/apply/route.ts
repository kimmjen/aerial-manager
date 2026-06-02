import { NextRequest, NextResponse } from "next/server";
import { isLibraryDirKey } from "@/lib/paths";
import { applyToSlot, assertSlotUuid } from "@/lib/slots";

export async function POST(req: NextRequest) {
  try {
    const { uuid, dir, name } = await req.json();
    if (!isLibraryDirKey(dir)) return NextResponse.json({ error: "bad dir" }, { status: 400 });
    await applyToSlot(assertSlotUuid(uuid), dir, name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
