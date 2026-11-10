import { HttpStatus, WebSocketClose, forwardableCloseCode } from "@/http";

// https://developers.cloudflare.com/sandbox/previews/#keep-websocket-connections-open
export function bridgeWebSocket(upstream: WebSocket, protocol: string | null): Response {
  const { 0: client, 1: server } = new WebSocketPair();

  upstream.binaryType = "arraybuffer";
  server.binaryType = "arraybuffer";
  upstream.accept();
  server.accept();

  relay(server, upstream);
  relay(upstream, server);

  const headers = new Headers();
  if (protocol) {
    headers.set("Sec-WebSocket-Protocol", protocol);
  }
  return new Response(null, { status: HttpStatus.SwitchingProtocols, webSocket: client, headers });
}

function relay(from: WebSocket, to: WebSocket): void {
  from.addEventListener("message", (event) => {
    try {
      to.send(event.data);
    } catch {
      from.close(WebSocketClose.InternalError, "The other side closed");
    }
  });
  from.addEventListener("close", (event) => {
    try {
      to.close(forwardableCloseCode(event.code), event.reason);
    } catch {}
  });
}
