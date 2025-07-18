Great. I’ll prepare a comprehensive report for your Cursor AI coding agent that explains how to unify the presence and notification system across all your Socket.IO servers by integrating them with a shared Redis instance.

This will include:

* A breakdown of how your current multi-instance system works and its limitations
* An implementation plan for integrating Redis-backed Socket.IO adapter to unify real-time state
* Step-by-step setup for deploying Redis on Railway and connecting it to your services
* Step-by-step setup for running Redis locally using Docker on your Mac

I’ll let you know once the report is ready.


# **Implementing a Shared Redis Adapter for Socket.IO in Curia**

## Current System Architecture and Limitations

**Curia’s real-time presence and notification system:** The Curia server (a Next.js/Node.js application) uses **Socket.IO** to manage real-time features like user presence, in-app notifications, and Telegram notifications. When the server starts, it creates a Socket.IO server bound to the HTTP server. Each user’s WebSocket connection is authenticated via JWT and then joined to specific Socket.IO **rooms** for their community and admin roles. For example, a user automatically joins `community:{communityId}` (and `community:{communityId}:admins` if they are an admin) upon connecting. Users can also join/leave board-specific rooms (like `board:{boardId}`) when they navigate between boards. This room architecture is used to broadcast events (new posts, comments, votes, etc.) to all clients in the relevant community or board.

**In-memory presence tracking:** The server maintains **in-memory maps** to track presence. When a user connects, a `DevicePresence` object is stored in a global `devicePresence` map, and the aggregated `EnhancedUserPresence` is stored in a `userPresence` map. This data includes which devices are online, the user’s info, current board, typing status, etc. For instance, on a new connection, the server does:

* Add the device entry to `devicePresence` map.
* Recalculate the user’s presence across devices and update `userPresence`.
* Emit a `userOnline` event to the community room with the user’s presence data.
* Send the new client an initial full presence sync (`globalPresenceSync`) containing the list of currently online users (from `userPresence` map).

On disconnect, the server removes that device from the map and updates the user’s presence (possibly marking them offline if no devices remain). Periodic cleanup runs to remove stale devices and typing indicators from memory, ensuring the presence data stays up-to-date.

**Event broadcasting with community “rooms”:** When certain events happen (e.g. a new post or comment), the backend triggers a broadcast through Socket.IO. Curia’s code uses a `customEventEmitter` to coordinate events from API routes, which calls a `broadcastEvent` function. The `broadcastEvent` logic is **“partnership-aware”** – it not only emits to the source community’s room, but also to any **partner communities** that should receive cross-community notifications. For example, if community A and B are partners and community A has a new post event, the server will emit that event to `community:A` and also to `community:B` (marking it as a cross-community notification). This is powered by a database table of community partnerships and a helper `getNotificationPartners()` which finds partner community IDs allowed to receive the notification.

**The limitation in a multi-instance setup:** Currently, **each running instance of Curia has its own Socket.IO server and in-memory state**. If you deploy multiple Curia instances (e.g. multiple containers or services) connected to the same database, **their real-time state is not shared**. Clients connected to instance A join rooms on A’s Socket.IO server, and clients on instance B join rooms on B’s server – but these servers don’t know about each other. This leads to several issues:

* **Presence fragmentation:** A user connected on instance A will appear online (in `userPresence` map) only on that instance. Users on instance B won’t get that user’s presence in their `globalPresenceSync` or `userOnline` events, because instance B is unaware of the connection on A. Essentially, each server only tracks and broadcasts presence for its own subset of users, so the “online users” view is incomplete when the community’s users are split across servers.

* **Missed cross-community notifications:** The cross-community broadcast in `broadcastEvent` uses `io.to("community:partnerId").emit(...)`. If a partner community’s users are connected to *another* instance, those clients are in the room `community:partnerId` but *on a different server*. Without coordination, the event emitted on instance A to `community:partnerId` does **not reach instance B’s clients**. In the current setup, that emit is effectively lost if no client in instance A is in that room. This means cross-community notifications (and any room-based event) do not work across instances.

* **Inconsistent real-time experience:** In general, any real-time event (new posts, votes, comments, presence, typing indicators) will only broadcast to clients on the same server. Users on different instances won’t see each other’s actions live. This defeats the purpose of the “partner communities” concept on the database level, since the real-time layer isn’t unified.

**Summary of idiosyncrasies:** The system cleverly uses community-based Socket.IO rooms and an in-memory presence map for fast real-time updates within a single server. However, **horizontally scaling** the app (running clones of the service) currently breaks the real-time sync across instances. The design assumed a shared state or single server; when scaled out, each instance becomes an island. To fix this, we need to **bridge the gap between Socket.IO servers** so that they behave like one distributed real-time system.

## Unifying Socket.IO Servers with a Redis Adapter

The standard solution to coordinate multiple Socket.IO instances is to use a **Socket.IO adapter backed by Redis**. Socket.IO’s Redis adapter uses Redis’s Pub/Sub under the hood to propagate events and room membership information to all servers, without storing persistent data in Redis. In practice, this means all your separate Curia service instances will act like a single logical Socket.IO server – messages or broadcasts from one instance will be delivered to clients on all instances, as long as they share the Redis Pub/Sub backend.

**How the Redis adapter works:** Each Socket.IO server process, on startup, will connect to the same Redis instance and subscribe to specific channels. When you call `io.emit()` or `io.to(room).emit()` on one instance, the adapter publishes the message to Redis; all other instances receive it and forward to their clients. No user data is permanently stored in Redis – it’s just a relay mechanism. According to the Socket.IO documentation, by using the Redis adapter, **multiple Socket.IO servers in different processes or servers can all broadcast and emit events to and from each other**. For example, after integrating Redis:

> “Any of the following commands:
> `io.emit('hello', 'to all clients');`
> `io.to('room42').emit('hello', "to all clients in 'room42' room");`
> …will properly be broadcast to the clients through the Redis Pub/Sub mechanism.”

In our case, this means:

* When instance A emits `userOnline` to `community:X`, instance B (and C, etc.) will also get that event and send it to their connected clients in room `community:X`. Thus, **everyone in community X, regardless of which server they’re connected to, will get the presence update**. This will significantly unify the presence view. (Clients on other instances might still not have that user in their initial `globalPresenceSync`, but they *will* immediately get the `userOnline` event and can update the UI accordingly. We might later consider syncing the initial presence via a shared store, but the events will ensure near-real-time consistency.)

* Cross-community notifications will finally reach all partners. If community A’s server triggers a `newPost` event intended for community B’s users, it emits to `community:B`. With Redis adapter, that emit goes to all servers, so the server hosting community B’s users will deliver the event. **Partner communities will reliably get each other’s notifications in real-time.**

* Essentially, any `io.to(room).emit(...)` or `socket.broadcast.emit(...)` becomes cluster-aware. The code doesn’t need major changes in its logic – adding the adapter makes these existing calls work across instances.

**Additional considerations – sticky sessions:** One thing to note when running Socket.IO on multiple nodes is the issue of session affinity (sticky sessions) for clients. Socket.IO can use long-polling during the handshake or as a fallback transport, which involves multiple HTTP requests. In a load-balanced environment, it’s important that all requests from a given client go to the same backend instance (at least during the WebSocket handshake), or the connection may break. Typically, enabling sticky sessions on the load balancer solves this. However, **Railway’s platform currently does not support sticky sessions**. This means if you scale your service to multiple replicas on Railway, clients might occasionally be routed to a different instance on subsequent requests. Without sticky sessions, the Socket.IO handshake (which might start with an HTTP polling request and then upgrade to WebSocket) could fail if it bounces to another instance.

**Mitigation:** To avoid issues on Railway, you can configure Socket.IO to **force WebSocket transport** only. By disallowing HTTP polling, the client will attempt a WebSocket upgrade immediately on the initial connection. If your clients connect via WebSocket (and your environment supports WebSockets), the connection is a single request that should be routed consistently. You can enforce this on the client side or server side. For example, on the client you might initialize the Socket.IO client with:

```js
io("https://yourserver", { transports: ["websocket"] });
```

This ensures no fallback to HTTP polling. Alternatively, when creating the Socket.IO server, you can specify allowed transports. This isn’t strictly required, but it can reduce connection glitches in a no-sticky-sessions environment like Railway. Keep in mind, if a WebSocket connection cannot be established, the client might not connect at all without polling, but most modern environments (including Railway) do support WebSockets.

## Setting Up a Shared Redis Instance on Railway

To implement the Redis adapter, we first need a Redis server that all Curia instances can connect to. Railway makes it easy to add a Redis database to your project:

1. **Provision a Redis service in Railway:** Go to your Railway project dashboard, click the **“+ New”** button, and select **“Database”** (or press `Ctrl+K` and search for Redis). Choose the Redis option to add it. This will create a new Redis service (Railway uses the Bitnami Redis Docker image by default). The Redis instance will start up within your project’s environment.

2. **Retrieve Redis connection details:** Once the Redis service is up, Railway will provide environment variables for its connection. In the Redis service’s page, you’ll see variables like:

   * `REDISHOST` – the hostname (likely something like `containers-us-west-...railway.app` or an internal host).
   * `REDISPORT` – the port (usually 6379).
   * `REDISPASSWORD` – an auto-generated password for the instance.
   * `REDISUSER` – the username (often “default” for Redis).
   * `REDIS_URL` – a convenient composite URL that includes all the above, e.g. `redis://default:<password>@<host>:<port>`.

   Railway’s docs confirm that these variables are provided for a Redis service. The `REDIS_URL` is especially handy, as we can use it directly in code.

3. **Make the Redis URL available to Curia services:** If your Curia instances are in the same Railway project, you can reference the Redis service’s env vars in your web service. For example, in your Curia service’s configuration, define an environment variable `REDIS_URL` and set its value to `${{ Redis.REDIS_URL }}` (Railway’s syntax to reference the Redis service’s variable). This way, each instance of Curia will have the same `REDIS_URL` pointing to the shared Redis. Alternatively, copy the value of `REDIS_URL` from the Redis service and add it to the Curia service’s env vars. **Ensure that all instances use the same Redis connection string.**

4. **Adjust firewall or network settings if needed:** By default, Railway’s services in the same project can talk to each other using those host/port credentials, and external access is possible via a proxy (which may incur egress costs). In our case, the Curia backend will connect internally to the Redis service using the given host and port – no special firewall rules needed when inside the project.

At this point, your Railway project has a Redis instance running and your Curia app knows how to connect to it via the `REDIS_URL` env variable.

## Setting Up Redis for Local Development (Docker on Mac)

For local testing and development, you’ll also want a Redis server running so that when you spin up multiple local instances (or simply to mirror production behavior), they use the adapter. There are a couple of ways to run Redis locally:

* **Using Docker CLI:** The quickest way is to run a Redis Docker container. For example, on your Mac with Docker installed, open a terminal and run:

  ```bash
  docker run -d --name curia-redis -p 6379:6379 redis:latest
  ```

  This will download the official Redis image (if not already downloaded) and start a container named `curia-redis`, exposing Redis on the standard port 6379 on your localhost. The `-d` flag runs it in the background. You can verify it’s running with `docker ps` or try connecting to it with a Redis client. By default, this Redis has no authentication (no password).

* **Using Docker Compose:** If your development workflow uses Docker Compose (for example, if you have a compose file for the Curia app and database), you can add a Redis service to it. For instance:

  ```yaml
  services:
    curia-app:
      build: .
      ports:
        - "3000:3000"
      environment:
        REDIS_URL: redis://redis:6379
        # ...other env vars like DATABASE_URL, etc.
      depends_on:
        - redis
    redis:
      image: redis:latest
      ports:
        - "6379:6379"
      volumes:
        - redis-data:/data
  volumes:
    redis-data:
  ```

  In this compose setup, the Curia app can refer to the Redis host as `redis` (the service name) on port 6379, and we set `REDIS_URL` accordingly. We also use a volume to persist data (though for dev/testing, persistence isn’t critical).

* **Using a native Redis installation:** Alternatively, you could install Redis on your Mac (via Homebrew, for example) and run it directly. Homebrew’s Redis service can be started with `brew services start redis`. If you go this route, ensure it’s listening on the default port and no password is set, then your `REDIS_URL` would be `redis://localhost:6379`.

**Configuring the local environment variables:** However you run Redis locally, you should set the environment variable that your app will use. In development, you might have a `.env` file. Add an entry like:

```
REDIS_URL=redis://localhost:6379
```

(if your Node app is running directly on your Mac). If you’re running the Node app itself in Docker and Redis on the host, use the host’s network address. Docker on Mac provides `host.docker.internal` as the DNS name to reach the host machine from inside a container. In that case:

```
REDIS_URL=redis://host.docker.internal:6379
```

inside the container’s env would point to the Redis server running on your Mac. In a Docker Compose setup as above, we used `redis://redis:6379` because the containers share a network and the service is named "redis". The key is to ensure the Node process can reach the Redis server via the URL.

After setting this up, you should be able to run your Curia server locally and have it connect to Redis for the adapter (we’ll implement the code for this next). If needed, you can run multiple instances of the Curia server locally (e.g., by starting the process on different ports pointing to the same local Redis) to simulate and test the multi-instance behavior.

## Code Changes: Integrating Socket.IO with Redis

With Redis ready, we now modify the Curia code to use the Redis adapter. The changes are all in the server initialization (in **`server.ts`**) where Socket.IO is set up.

**1. Install the Redis adapter package:** If not already in your package.json, add `@socket.io/redis-adapter` as a dependency, as well as a Redis client library. We can use Node’s official Redis client (`redis` package) which is modern and promise-based. Install these via your package manager, for example:

```
yarn add @socket.io/redis-adapter redis
```

This will allow us to create a Redis connection in code and attach the adapter. (The older `socket.io-redis` package is deprecated in favor of `@socket.io/redis-adapter`, which we are using.)

**2. Import and create Redis clients in `server.ts`:** At the top of **`server.ts`**, import the necessary functions. We’ll import `createClient` from the `redis` package and `createAdapter` from `@socket.io/redis-adapter`. For example:

```typescript
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
```

Then, within the async bootstrap (before starting the server), we will initialize the Redis connections. We need two Redis connections (one for publish, one for subscribe) as per Socket.IO’s requirements. We can duplicate a single client for this. For instance:

```typescript
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error('REDIS_URL is not set. Unable to initialize Redis adapter.');
} else {
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  console.log('[Socket.IO] Redis adapter attached – using Redis at', redisUrl);
}
```

This code does the following:

* Reads the Redis connection URL from the environment.
* Creates a Redis client for publishing (`pubClient`) and duplicates it for subscribing (`subClient`).
* Connects both to the Redis server (using `await` to ensure the connection is established before we proceed).
* Calls `io.adapter(createAdapter(pubClient, subClient))` to plug the Redis adapter into our Socket.IO server. This one line **replaces the default in-memory adapter with a Redis-backed adapter**, enabling cross-process communication.
* Logs a confirmation that the adapter is set up.

Place this initialization **after** you instantiate `io` but **before** you start using `io` to handle connections or emit events. In `server.ts`, the Socket.IO server is created as `io = new SocketIOServer(httpServer, { ... })`. Right after that line (and after any immediate config like CORS), you should integrate the Redis adapter. For example:

```typescript
io = new SocketIOServer(httpServer, { ...cors settings... });

// Attach Redis adapter for multi-instance support
const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  console.log('[Socket.IO] Redis adapter initialized for multiple instances');
} else {
  console.warn('[Socket.IO] REDIS_URL not provided, running without Redis adapter!');
}
```

By doing this inside the `bootstrap()` function (which is `async`), we ensure the adapter is set up **before** any events are emitted or any connections are accepted. This way, even the first connecting users will be properly handled in the context of the Redis adapter.

**3. Verify and adjust event logic if necessary:** In most cases, you do not need to change your event logic at all – the adapter will take care of broadcasting events cluster-wide. For example, currently the code does:

```js
io.to(`community:${payload.communityId}`).emit(eventName, payload);
```

in the broadcastEvent function. After adding the adapter, this exact call will automatically forward the event to all Socket.IO servers using that Redis. Each server will emit to its local sockets in room `community:XYZ`. So, the partnership notifications will now reach every user in partner communities, no matter which instance they are connected to. Similarly, presence events like `userOnline` and `userPresenceUpdate` (which also use `broadcastEvent` under the hood) will propagate. **No code changes needed in those handlers.**

One thing to double-check is how the initial presence sync (`globalPresenceSync`) is done. Currently, when a user connects, the server calls `socket.emit('globalPresenceSync', getOnlineUsers())` sending the list of online users from its local memory. With multiple instances, `getOnlineUsers()` on each instance only reflects that instance’s known users. So a user on instance A will not immediately see users connected solely to instance B in that initial list. However, since we broadcast `userOnline` and `userOffline` events across instances, the newly connected client should soon receive `userOnline` events for any users that are online on other instances. The presence list will update as those events come in. This is a slight inconsistency to be aware of (initial state vs. eventual consistency via events). If this is a concern, a more advanced solution would be to store presence information in Redis (for example, each instance could update a Redis data structure when users connect/disconnect, and `getOnlineUsers()` could aggregate from Redis). That’s a possible future enhancement – but not strictly required for basic functionality. To keep it simple, you might accept that the very first moment a user connects, their online list could be incomplete, but within a second or two, they’ll get events to fill in the gaps.

**4. Deploy and test:** Deploy the updated code to Railway. Make sure all instances pick up the `REDIS_URL` configuration. When the services start, you should see in the logs something like “\[Socket.IO] Redis adapter initialized…” confirming the adapter is in effect. Test the functionality:

* Open clients connected to two different instances (you might simulate this by scaling your Railway service to 2 instances, or by running one locally and one on Railway, etc.). Log in as different users on each.
* Verify that when User A (on instance 1) comes online or performs an action, User B (on instance 2) sees the real-time event. For presence, try opening a board on one user and see if the other user’s presence indicator shows them. Also try cross-community notifications if you have partnerships set up – e.g., create a post in community A and ensure a user in community B (on a different instance) sees the notification pop up.
* Check the logs for any Redis errors. If the Redis connection fails (e.g., wrong URL or auth), the adapter might silently fail or just not broadcast. Ensure the env vars are correct. You can also use the Railway console to monitor if the Redis service is receiving Pub/Sub messages. (For debugging, Railway allows connecting to the Redis with a CLI; or use `redis-cli` from your machine to monitor `PSUBSCRIBE *` and watch messages as Socket.IO publishes them).

**5. Sticky session note:** As discussed, Railway doesn’t support sticky sessions. If you notice issues with connections not establishing consistently when you have multiple instances, consider setting the Socket.IO **transports to WebSocket only** in your client code to mitigate this. This will reduce the chance that a socket negotiation fails due to load balancing. In practice, many apps on Railway have gotten websockets to work on multiple instances using the Redis adapter (the real-time events go through) – it’s just initial handshakes that can be problematic without affinity. Keep this in mind if you scale to many replicas.

## Step-by-Step Implementation Summary

For clarity, here’s a concise step-by-step checklist to implement the above:

1. **Add Redis on Railway:** In your Railway project, add a Redis service. Note the `REDIS_URL` (or the host, port, password separately). Reference this in your Curia service’s environment. For example, set an environment variable `REDIS_URL` in the Curia service to `${{Redis.REDIS_URL}}`. Verify that on deploy, your Curia instances have the correct Redis connection string in `process.env.REDIS_URL`.

2. **Set up Redis locally:** Run a Redis instance for dev (Docker or otherwise) and set `REDIS_URL` in your local env (`.env`) to point to it (e.g. `redis://localhost:6379`). If your app runs in Docker locally, ensure it can reach the host or use a Docker Compose for an internal Redis.

3. **Install dependencies:** Add `redis` and `@socket.io/redis-adapter` to your project. These will be needed for connecting to Redis and using the adapter.

4. **Modify server initialization:** In `server.ts`, import `createClient` from `'redis'` and `createAdapter` from `'@socket.io/redis-adapter'`. After creating the Socket.IO server (`io = new SocketIOServer(...)`), initialize the Redis pub/sub clients and attach the adapter:

   ```typescript
   const pubClient = createClient({ url: process.env.REDIS_URL });
   const subClient = pubClient.duplicate();
   await pubClient.connect();
   await subClient.connect();
   io.adapter(createAdapter(pubClient, subClient));
   ```

   This follows the official Socket.IO v4 adapter usage. (Make sure this code is in an `async` context like your bootstrap function, so you can `await` the connections.)

5. **Run and test:** Start your app. In the server log, you should see confirmation that the Redis adapter is in use. Test connecting multiple clients (if possible to specific instances). The behavior of `io.emit` and `io.to(room).emit` should now be global. For example, broadcasting an event on one instance reaches all. The presence indicators and notifications should update for all users across instances, reducing the “silo” effect from before.

6. **Monitor for issues:** Watch out for any error messages related to Redis in your logs (e.g., authentication errors, connection drops). The adapter will try to recover if Redis goes down, but if Redis is unavailable, cross-instance messaging will temporarily stop (it will silently fall back to per-instance). Ensure your Redis instance on Railway is stable and configured with adequate plan/resources for your load. Redis is lightweight for Pub/Sub, so the free plan might suffice initially.

By completing these steps, you will have effectively **unified the Socket.IO servers** of all Curia instances. Each user, no matter which container or service instance they hit, will participate in the same real-time system. This leverages the existing room and event design you built: community rooms, board rooms, and partnership broadcasts all function as intended, now across the whole cluster. The result is a seamless real-time experience in a horizontally scaled environment.

## References

* Curia presence and Socket.IO implementation (from the `curia` repository):

  * Definition of in-memory presence data structures and adding devices on connection.
  * Joining community and admin rooms on connect.
  * Board join/leave handlers.
  * Broadcast event logic with partner communities.
* Socket.IO Redis Adapter documentation:

  * Socket.IO official guide on using multiple nodes and Redis adapter (example usage).
  * Explanation of how the Redis adapter enables cross-server broadcasting.
  * Migration to `@socket.io/redis-adapter` (modern package).
* Railway documentation:

  * Guide on adding a Redis database and available env vars (`REDISHOST`, `REDIS_URL`, etc.).
  * Railway community feedback noting lack of sticky sessions (relevant to WebSocket scaling).
