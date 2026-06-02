import { NextRequest, NextResponse } from "next/server";
import { deleteLibraryFile, renameLibraryFile } from "@/lib/library";
import { isLibraryDirKey } from "@/lib/paths";

export async function PATCH(req: NextRequest) {
  try {
    const { dir, name, newName } = await req.json();
    if (!isLibraryDirKey(dir)) return NextResponse.json({ error: "bad dir" }, { status: 400 });
    renameLibraryFile(dir, name, newName);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { dir, name } = await req.json();
    if (!isLibraryDirKey(dir)) return NextResponse.json({ error: "bad dir" }, { status: 400 });
    deleteLibraryFile(dir, name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
