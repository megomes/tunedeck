import { NextResponse } from "next/server";
import { withSession } from "@/lib/server/auth";
import { disableConnector, getConnectorToken, rotateConnectorToken } from "@/lib/server/feed";

export const GET = withSession(async () => NextResponse.json({ token: await getConnectorToken() }));

/** Turns the Claude connector on, or replaces its URL so the old one stops working. */
export const POST = withSession(async () => NextResponse.json({ token: await rotateConnectorToken() }));

export const DELETE = withSession(async () => {
  await disableConnector();
  return NextResponse.json({ token: null });
});
