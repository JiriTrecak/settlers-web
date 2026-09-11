# ws

Browser `Channel` over WebSocket. Buffers until the first `onMessage`. Extra listeners append (App `start` wait + Session Lockstep). Session never `new WebSocket`.

Transport `latencyProbe` messages are echoed immediately as `latencyReply` and are not buffered or dispatched to gameplay listeners. This allows lobby measurements before a Session exists.
