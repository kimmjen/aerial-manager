import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_UPLOAD_KEY, LIBRARY_DIRS } from "@/lib/config";
import { isLibraryDirKey, isSafeVideoName } from "@/lib/paths";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const dir = String(form.get("dir") ?? "") || DEFAULT_UPLOAD_KEY;
    if (!isLibraryDirKey(dir)) return NextResponse.json({ error: "bad dir" }, { status: 400 });

    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: "no files" }, { status: 400 });

    const saved: string[] = [];
    for (const file of files) {
      const name = path.basename(file.name);
      if (!isSafeVideoName(name)) return NextResponse.json({ error: `unsafe name: ${name}` }, { status: 400 });
      const dest = path.join(LIBRARY_DIRS[dir], name);
      if (fs.existsSync(dest)) return NextResponse.json({ error: `already exists: ${name}`, dir }, { status: 409 });
      fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
      saved.push(name);
    }
    return NextResponse.json({ saved, dir });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
