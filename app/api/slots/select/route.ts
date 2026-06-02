import { NextRequest, NextResponse } from "next/server";
import { assertSlotUuid } from "@/lib/slots";
import { setSelectedSlot } from "@/lib/wallpaper";

export async function POST(req: NextRequest) {
  try {
    const { uuid } = await req.json();
    await setSelectedSlot(assertSlotUuid(uuid));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
