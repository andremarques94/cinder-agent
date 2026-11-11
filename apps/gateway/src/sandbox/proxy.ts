import type { Activity } from "./activity.ts";
import { bridgeWebSocket } from "./websocket-bridge.ts";

export async function proxyToServer(
  port: Fetcher,
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
