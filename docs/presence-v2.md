Great — I’ll now investigate the cleanest, production-ready solutions to fix your cross-instance presence sync bug without migrating the entire system to Redis. I’ll prioritize event-driven and hybrid models, look for real-world multi-instance Socket.IO patterns, and recommend a low-complexity fix that you can implement in 1–2 days. I’ll let you know as soon as the findings are ready.


# Redis Presence Sync – Clean Fix vs. Full Migration

## **Problem Recap & Root Cause**

In our multi-instance Socket.IO deployment, the initial presence data sent to a new user only includes *local* connections. Each server keeps its own `devicePresence`/`userPresence` maps, so the first `globalPresenceSync` emit misses users on other instances. This results in the **"one-directional visibility"** bug: a user joining on Server B doesn’t see users already online on Server A (because the sync only pulled Server B’s map). Real-time events like `userOnline` broadcast via the Redis adapter do propagate cross-instance, but **initial state is inconsistent** due to that local-only lookup.

## **Why Not Just Move Everything to Redis?**

A full migration of presence state to Redis (storing all online users/devices centrally) was attempted but proved **complex and risky**. Converting 50+ functions to async, wrestling with Redis client types, and deeply integrating Redis calls into auth/room logic is a big refactor. It also **adds latency** – local memory lookups are \~1μs, whereas a Redis call is \~1–5ms (1000x+ slower per operation). That’s acceptable for occasional syncs, but doing it on every presence update would hurt performance. While a **full Redis single-source-of-truth** would ensure perfect consistency, it’s overkill for fixing this one sync bug and could introduce new failure modes (e.g. if Redis goes down). We need a simpler solution that preserves the snappy local map reads and only leverages Redis when absolutely needed.

## **Solution Options Overview**

Let’s evaluate the main approaches to sync the initial presence across instances, focusing on minimal disruption:

1. **Event-Based Sync (Minimal Fix):** Use the Socket.IO cluster communication (via Redis pub/sub) to gather presence from all instances on-demand when a new client connects.
2. **Hybrid “Dual-Write” Presence:** Continue using local maps for fast reads, but also update a global Redis store on connect/disconnect. New connections fetch from Redis for initial state.
3. **Full Redis Migration:** Store all presence data (devices and users) in Redis and read from it exclusively, eliminating local state fragmentation.
4. **Reactive Local Updates:** Update each server’s local maps when it receives cross-instance `userOnline/userOffline` events, so that **each node eventually knows all online users** without querying Redis.

We’ll prioritize **non-async, low-complexity fixes** (options 1 and 4), and only consider deeper Redis integration if needed.

## **Option 1: On-Demand Event Sync via Redis** (Recommended)

This approach treats the **other Socket.IO servers as sources of truth** for their local users and uses Redis pub/sub to query them when needed. There are two ways to implement this:

* **Using Socket.IO’s `serverSideEmit()` (v4.x)** – Socket.IO 4 introduced an API for servers to communicate with each other through the adapter. We can emit an event (like `"getAllPresence"`) to **every node in the cluster and gather their responses**. Each server would listen for `"getAllPresence"` events and reply with its current `getOnlineUsers()` (local userPresence list). The originating server collects all responses (Socket.IO supports an ACK callback with aggregated responses), merges them, and sends the combined presence list to the connecting client. This essentially *pulls* presence from all instances on-demand.

  * **Pros:** Very little new code – just define a handler for `"getAllPresence"` and replace the direct `socket.emit('globalPresenceSync', …)` with a `serverSideEmit` call. No need to convert dozens of functions to async; you can use the callback/Promise from `serverSideEmit` right inside the connection handler. Socket.IO handles the Redis pub/sub under the hood. This approach is actually recommended by Socket.IO for cluster-wide queries: *“the `serverSideEmit()` method sends an event to every node in the cluster, and waits for their responses.”* It avoids storing anything extra in Redis permanently – data remains in each node’s memory, pulled only when needed.
  * **Cons:** The initial sync will be slightly delayed (a few milliseconds) as it waits for responses. However, with a small number of instances this is negligible. If a node is unresponsive (or down), the call could time out – but in that case, those users are effectively offline anyway. It’s also a bit of added network chatter on each connect (one request broadcast and multiple responses), but given our scale (even 5–10 instances and a moderate connect rate) this is trivial.

  **Complexity Estimate:** Low. Likely on the order of **a few dozen lines** of code. We’d add something like:

  ```ts
  io.on("getAllPresence", (cb) => cb(getOnlineUsers()));
  // ... on new connection:
  io.serverSideEmit("getAllPresence", (err, results) => {
      if (err) {
          console.error("Presence sync error:", err);
          socket.emit('globalPresenceSync', getOnlineUsers()); // fallback to local only
      } else {
          // results is an array of presence arrays from each server
          const allUsers = results.flat();
          socket.emit('globalPresenceSync', allUsers);
      }
  });
  ```

  This keeps everything else (presence updates, typing indicators, etc.) the same. We’re just fixing the initial snapshot.

* **Custom Redis Pub/Sub event** – Similar in concept to `serverSideEmit`, we could manually publish a “presence request” message on Redis when a user connects. Other instances (subscribers) would react by sending their user lists (either directly to the requesting server via another channel or perhaps broadcasting userOnline events targeted to that new user). This is essentially reimplementing what `serverSideEmit` provides out of the box. Given that we already have the Socket.IO Redis adapter running, it’s easier to use it than to create a parallel pub/sub channel. So, I would favor the built-in method unless we encounter limitations.

Either way, **event-driven sync** is a clean solution that avoids a full state overhaul. It leverages our **existing Redis adapter** purely to coordinate state, while keeping the fast local memory reads in steady-state. This should fix the bug: when User B connects on Instance 2, it will collect presence from Instance 1 (and others) and immediately send B the full list including User A.

> **Gotcha:** Make sure to only send the presence sync *after* the user has joined their community room (in your code, you do `socket.join("community:ID")` before emitting sync). That way, if any presence events fire during the tiny window of fetching state, the user’s socket is already in the room to receive them. This avoids a race where a user comes online on another server at the same moment and our new user misses that event. The timing should be fine as long as the join is done first (as it is now in `server.ts`).

## **Option 2: Hybrid Dual-Write to Redis (Global Index)**

Another approach is to maintain a **minimal global presence store** in Redis alongside the local maps. Rather than storing full user objects, we could store just enough to answer “who’s online” queries. For example, keep a Redis Set or Hash of online user IDs (or user->count of connections):

* On each connect: `SADD online_users <userId>` (and maybe `HINCRBY user_connections <userId> 1` if multi-device tracking is needed).
* On disconnect: decrement the count and `SREM` if it hits zero. Use a short TTL on these keys to auto-clean if a server dies unexpectedly.

Then `globalPresenceSync` for a new user could be served by querying that Redis set/hash to get all online user IDs, and then looking up each user’s info to build `EnhancedUserPresence` objects. The lookup for details could either come from:

* Redis (if we also stored user info or device list there – e.g. a `user:presence` hash as in your attempted implementation), or
* from local memory/DB: perhaps each server only stores details for its users, so for others you’d need a DB query for names/avatars. Storing in Redis might be easier for a quick response.

**Pros:** This provides a single source of truth for “who is online” without making every presence operation async. Writes to Redis happen on connect/disconnect (relatively infrequent), and reads happen only on initial sync. All the real-time events can still use the local maps. It’s also a step toward full Redis migration if you eventually want that. Notably, the Socket.IO docs explicitly suggest an external store for tracking all connected users in a cluster, to efficiently list or count users across nodes. This hybrid model uses Redis as that *presence index* while keeping detailed state in memory.

**Cons:** It’s more code than the event approach and introduces *consistency risks*. You now have to keep the local and Redis state in sync. For instance, if Redis fails or lags, a user might appear online locally but not be in the global set (or vice versa). You’d want to add safeguards: e.g. if a Redis write fails, maybe retry or at least log it – but ensure the local flow still continues. Also, multi-device tracking needs careful handling: if a user has 2 devices and one disconnects, you should only remove them from Redis when the last device is gone. Using a hash with a connection count (as Socket.IO’s guide illustrates) or storing each device and aggregating counts can handle this. This complexity is doable but not trivial.

**Complexity Estimate:** Moderate. Implementing dual-write will touch the connection and disconnection logic (to write to Redis), as well as initial sync (to read from Redis). Probably a day or two of coding and testing. You’ll need to carefully test scenarios like: Redis is down (does the system still function using stale local data?), a server crashes without disconnecting (TTL will eventually clear its users), etc. The nice part is you can do this incrementally: *add* Redis writes while still using local maps, and once confident, switch initial sync to Redis. (Your phase 1/2/3 plan in `RedisPresenceService.ts` was along these lines.)

## **Option 3: Full Redis Backend for Presence**

This is essentially what you started in `RedisPresenceService.ts`: store every device and user presence detail in Redis and make all server instances read/write from that store instead of local maps. It would solve the consistency completely – every node would query Redis for the definitive list of online users. However, as we saw, **the trade-offs are significant**:

* **Performance:** Every presence update (user active, typing status, etc.) becomes a Redis operation. You noted a 1–5ms cost per call. With potentially thousands of presence events (typing, board changes, etc.), this could add up and introduce latency in UI updates. A local memory update is virtually free. You can mitigate some of this with caching or batched updates (as hinted by your debouncing logic), but it’s a big change in profile.
* **Complexity:** Converting many functions to `async/await` and handling Redis promises everywhere increases the chance of new bugs. Also, error handling needs to be very robust – e.g., if Redis is unreachable, do we block user connections? Or fall back to degraded local-only mode? Those scenarios need planning.
* **Maintenance:** This is a heavy refactor that touches core parts of your app. It’s harder to complete in 1-2 days and safely roll out.

For these reasons, a full migration is not the “fastest clean fix” for the immediate bug. It might be something to consider long-term (if you need to scale to many instances or want to persist presence for analytics), but it overshoots the current requirement. Many real-world systems avoid this unless truly necessary – for example, the official Socket.IO guide suggests an external store only for **counting or listing** all users, not for every single presence operation.

**Verdict:** Put full migration aside for now. We can achieve our goal with far less upheaval.

## **Option 4: Replicate State via Events (Local Map Sync)**

This approach stays entirely in-memory: use the existing `userOnline`/`userOffline` events to **update every server’s local presence maps** so they all converge on the same global view. Essentially, treat the presence events as a gossip mechanism to keep the `userPresence` Map in sync across instances:

* When Server A broadcasts `'userOnline'` for User A, have Server B (and C, etc.) listen and add User A to its own `userPresence` map. Similarly on `'userOffline'`, remove the user from local maps on all servers. Then each server’s `getOnlineUsers()` would return truly global data, making the initial sync correct without any additional querying.

This strategy is conceptually simple and keeps everything synchronous. It’s similar to how distributed online games or old-school chat servers propagate presence – each node remembers who’s online everywhere by virtue of the events. In fact, many large-scale chat architectures do something like this in combination with a central store: **each WebSocket server maintains an in-memory map of connected users, and on login/logout it broadcasts that change via Redis Pub/Sub to all servers**. This gives a fast local lookup (for things like “is user X online?”) while keeping nodes informed of each other. Our system already has the broadcast; we’d just be updating the in-memory maps on the receiving side.

**Pros:** No Redis reads on connect, no new endpoints – just augment the event handlers. It preserves the ultra-fast O(1) local map operations for presence checks. Also, this paves the way to implementing the *“userOffline”* notifications properly. (Notably, your current code logs a user offline but doesn’t broadcast it to communities due to not knowing the community ID at removal. If we store that association or include it in the offline event, we can broadcast `userOffline` and update maps accordingly.)

**Cons:** This makes the server state eventually consistent rather than strongly consistent. There is a small window during which a new user connecting on B might not yet have received a prior `userOnline` from A (if A’s event was in transit). However, in practice the Redis adapter broadcasts events almost instantly, and in our case the issue is the *initial state* – which we would solve because either the event arrived in time to update the map, or we still need a backup query. Another concern is if a server starts up fresh (no initial state) it won’t have past users until they disconnect/reconnect or a query is made. We could partly address that by doing a one-time presence request on server startup to prime its map (similar to Option 1 but just at boot). Even if not, the impact is that a freshly booted instance might initially show an empty presence until events trickle in – which is exactly the bug we have for new connections! So by itself, passive event syncing may not solve *all* cases.

There’s also a **scalability caution**: if the number of users grows large (say tens of thousands), replicating full state to every node means each server holds all users in memory and processes every presence event, even for communities that server might not care about. In our scenario, communities partition the events (we broadcast to `community:<id>` rooms, not globally), so each server only hears events for communities it has users in. That limits the scope and is okay. But it’s worth noting for future: a truly large system might partition presence by shard instead of full replication.

**Complexity:** Low-to-moderate. You’d implement a listener for the `'userOnline'` event on the server side. Since `broadcastEvent` currently emits to clients, you don’t have a direct hook for server code to run on those events. One way is to emit a *server-side* event in parallel (using `customEventEmitter` or even `process.send` in cluster) – probably overkill. Another is to wrap `broadcastEvent` so that when it does `io.to(...).emit('userOnline', payload)`, you also call an internal function to `userPresence.set(payload.userId, payload.userPresence)` on all servers. Achieving the “on all servers” part without writing a lot of glue is tricky with pure local code. Essentially, we’d be recreating the server-to-server communication that Option 1 already gives us.

So, while this *could* work and aligns with common patterns, it ends up looking very much like Option 1 (you’d send an event and handle it on each node) – except doing it at the moment of user connect rather than on the new user’s request. It doesn’t fundamentally avoid needing a cross-node query; it just pushes it to happen automatically on each event. If any event is missed or a node comes late, we’re back to square one. Therefore, I see this as a complementary improvement (especially broadcasting `userOffline`) but not a standalone fix for the initial sync problem.

## **Real-World Inspiration**

It’s reassuring that the **event-driven approach (with a backing store)** is how many real systems handle presence. For example, one scaled chat design uses a dedicated *Presence Service* and Redis: each server keeps an in-memory user map, broadcasts presence changes through Redis, and Redis maintains a map of which server each user is on. This yields a *“stateless, fault-tolerant, fast”* presence sync mechanism – very similar to what we’re aiming for. Slack and Discord don’t publish their exact internals, but generally they use a form of **distributed cache or pub/sub for presence**. Slack’s API notes that a user is “active if they have at least one client connected”, implying there’s a central way to count connections (likely using something like Redis or a presence microservice). Discord reportedly shards users and uses events to update who’s online in each guild. The common theme is: keep transient presence data in memory for speed, and use a lightweight mechanism (pub/sub or central store) to sync state across nodes.

Socket.IO’s maintainers also recognize the need for cross-instance state queries. The introduction of `fetchSockets()` and `serverSideEmit()` in v4 was precisely to handle use cases like retrieving a list of all connected users in a cluster. One suggested method is to join each socket to a room named after its userId, then use `io.in(userId).fetchSockets()` to check if that user has any connections across the cluster. That works for *single-user lookup*. However, for a *global list of users*, calling `fetchSockets()` for every user is inefficient. That’s why they conclude that *“the most efficient solution for \[listing all users] is to use an external store like Redis.”*. In our case, *per-community* presence is the goal (not one giant list for the whole system), but the principle stands: **on-demand querying of other servers or a shared store** is the way to get a complete list.

## **Recommendation**: **Event-Driven Sync Request (Quick Fix)**

To solve the immediate bug with minimal upheaval, I recommend **Option 1: using the Redis adapter’s ability to coordinate state on demand**. Implement a `serverSideEmit` (or equivalent pub/sub) that, upon a new connection, gathers online users from all servers and merges them. This approach directly addresses the root cause (incomplete data at sync) without changing how presence is managed the rest of the time.

**Why this is the cleanest fix:** It requires very targeted changes:

* **No schema or data structure overhaul** – we reuse the existing `EnhancedUserPresence` objects from each server.
* **No global state to maintain constantly** – we only do work at the moment it’s needed (when a user connects or possibly when a server starts up fresh).
* **Leverages tested code** – each server’s `getOnlineUsers()` already produces the correct view of *that* server. We trust those and just aggregate the results.
* **Easily testable** – we can simulate two servers in dev and verify that after the change, User B connecting always sees User A and vice versa. The logic is straightforward to unit test by faking responses from servers.

**Complexity & Time**: This is a **1-day fix** at most. Most of the time will be testing the timing and perhaps tweaking the data merge (ensuring no duplicate users in the combined list, handling multi-device aggregation correctly if two servers report devices for the same user). But since each server currently aggregates its userPresence per user, we might get two entries for the same user if they happen to be connected to two different servers. We should merge those (e.g. combine the `devices` arrays). That’s a small extra step: group the results by userId and call `aggregateUserPresence` across them – or better, modify the remote response to send *device* data and then aggregate globally. An easy path: have each server respond with its list of **DevicePresence** objects (not aggregated by user). Then the requesting server can concat all device lists and run its existing `aggregateUserPresence` on the combined list (for each user). This way, the aggregation logic (merging devices into a user object) is reused and we naturally handle multi-device, even across servers. This detail adds a bit of work, but nothing scary.

**Handling Failures:** If Redis is momentarily down or one server doesn’t respond in time, we should still send *something* to the client. In the worst case, we could fall back to the local `getOnlineUsers()` (show at least whoever is on the same instance) and rely on the eventual `userOnline` events to fill the gaps. The impact window would be small. We should log any such errors for monitoring but not let it crash the flow.

In summary, **asking all other nodes for their online users at connect-time** is a standard, clean solution here. It avoids sweeping rewrites, keeps our performance optimizations intact, and fixes the one-directional sync issue directly. This can be delivered quickly and verified easily.

## **Longer-Term Considerations**

While the event-sync fix will solve the immediate problem, you’ve already laid groundwork for a more robust presence system (the Redis service, etc.). In the future, if you anticipate running a large number of instances or want to handle **server restarts gracefully**, a more persistent global store could be beneficial. The dual-write hybrid approach (Option 2) is a nice middle ground if you ever need to move in that direction incrementally. It’s basically what high-scale systems do: keep an **external Redis hash of all online users** (with counts or device lists) so any node or ancillary service can quickly query global presence. For now, though, we can get all the benefits without that complexity.

Also, don’t forget to implement the **`userOffline` propagation** once you have a way to get communityId for offline events (you might store a map of userId->community when they connect). Broadcasting a `userOffline` event to the community will let clients remove users immediately when they disconnect on another instance. Right now, I suspect the UI might only realize a user went offline when TTL cleanup happens or if they try to interact. A quick fix there: include `communityId` in the payload for offline (you have it in each device or user record), and broadcast similar to `userOnline`. The event-driven sync approach will cover initial presence, and proper offline events will cover departures – giving a complete presence picture across instances.

To summarize, **my vote is to implement the event-based presence sync on connect**, monitor the results in production (with logging to ensure it’s working across all instances), and thereby close the visibility gap immediately. This keeps the system’s design simple and builds on patterns the Socket.IO ecosystem expects (in fact, this mirrors how Socket.IO’s own documentation approaches cluster presence). It’s production-safe, relatively easy to reason about, and you can always iterate further if needed.

**Sources:** Multi-node Socket.IO presence patterns and recommendations, and real-world scalable chat architecture practices for presence which align with the proposed solution. The current code’s behavior was analyzed in `server.ts` and the issue documented in our repo. These guided the choice of an event-driven sync fix as the most pragmatic solution.
