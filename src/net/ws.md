# ws

Browser `Channel` over WebSocket. Buffers until the first `onMessage`. Extra listeners append (App `start` wait + Session Lockstep). Session never `new WebSocket`.
