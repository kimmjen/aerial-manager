import { NextResponse } from "next/server";
import { reapplyAll } from "@/lib/slots";

export async function POST() {
  try {
    const results = await reapplyAll();
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
