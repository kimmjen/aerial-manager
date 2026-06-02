import { NextResponse } from "next/server";
import { getSlots } from "@/lib/slots";

export async function GET() {
  try {
    return NextResponse.json(await getSlots());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
