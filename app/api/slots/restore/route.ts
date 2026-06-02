import { NextRequest, NextResponse } from "next/server";
import { assertSlotUuid, restoreSlot } from "@/lib/slots";

export async function POST(req: NextRequest) {
  try {
    const { uuid } = await req.json();
    await restoreSlot(assertSlotUuid(uuid));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
