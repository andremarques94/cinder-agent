import type { Activity } from "../lifecycle/activity.ts";
import type { ServerPort } from "../lifecycle/server.ts";
import { bridgeWebSocket } from "./websocket-bridge.ts";

export async function proxyToServer(
  port: ServerPort,
  request: Request,
  activity: Activity,
): Promise<Response> {
  const response = await port.fetch(request);
  if (response.webSocket) {
    return bridgeWebSocket(
      response.webSocket,
      response.headers.get("Sec-WebSocket-Protocol"),
      activity.hold(),
    );
  }
  return activity.track(response);
}
