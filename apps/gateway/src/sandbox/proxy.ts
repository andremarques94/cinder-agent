import { bridgeWebSocket } from "./websocket-bridge.ts";

export async function proxyToServer(port: Fetcher, request: Request): Promise<Response> {
  const response = await port.fetch(request);
  return response.webSocket
    ? bridgeWebSocket(response.webSocket, response.headers.get("Sec-WebSocket-Protocol"))
    : response;
}
