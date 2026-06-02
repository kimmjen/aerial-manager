import { NextResponse } from "next/server";
import { listLibrary } from "@/lib/library";

export async function GET() {
  try {
    return NextResponse.json(listLibrary());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
