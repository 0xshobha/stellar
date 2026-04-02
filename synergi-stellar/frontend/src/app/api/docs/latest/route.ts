import { NextResponse } from "next/server";

import { listNewestDocs } from "../../../../lib/docs";

export async function GET() {
  const docs = await listNewestDocs(3);
  return NextResponse.json({ ok: true, data: { items: docs } });
}
