diff --git a/Dockerfile b/Dockerfile
index 9f21304..0405851 100644
--- a/Dockerfile
+++ b/Dockerfile
@@ -26,6 +26,7 @@ ARG TELEGRAM_BOT_NAME
 ARG NEXT_PUBLIC_LUKSO_IPFS_GATEWAY
 ARG NEXT_PUBLIC_RSS_BASE_URL
 ARG NEXT_PUBLIC_HOST_SERVICE_URL
+ARG REDIS_URL
 
 # Copy package.json and yarn.lock first to leverage Docker cache
 COPY package.json yarn.lock ./
diff --git a/docker-compose.yml b/docker-compose.yml
index 96abc6e..f07d0c5 100644
--- a/docker-compose.yml
+++ b/docker-compose.yml
@@ -20,5 +20,21 @@ services:
     depends_on:
       - postgres
 
+  # Redis service for Socket.IO adapter
+  redis:
+    image: redis:7-alpine
+    restart: always
+    ports:
+      - "6379:6379"
+    volumes:
+      - redis_data:/data
+    command: redis-server --appendonly yes
+    healthcheck:
+      test: ["CMD", "redis-cli", "ping"]
+      interval: 30s
+      timeout: 10s
+      retries: 3
+
 volumes:
-  postgres_data: 
\ No newline at end of file
+  postgres_data: 
+  redis_data: 
\ No newline at end of file
diff --git a/package.json b/package.json
index bfde0aa..7f6dc3e 100644
--- a/package.json
+++ b/package.json
@@ -37,6 +37,7 @@
     "@radix-ui/react-tabs": "^1.1.12",
     "@radix-ui/react-toast": "^1.2.14",
     "@rainbow-me/rainbowkit": "^2.2.6",
+    "@socket.io/redis-adapter": "^8.3.0",
     "@tanstack/react-query": "^5.80.6",
     "@tiptap/extension-blockquote": "^2.12.0",
     "@tiptap/extension-bullet-list": "^2.12.0",
@@ -80,6 +81,7 @@
     "react": "^19.0.0",
     "react-dom": "^19.0.0",
     "recharts": "^3.0.2",
+    "redis": "^5.6.0",
     "socket.io": "^4.8.1",
     "socket.io-client": "^4.8.1",
     "sonner": "^2.0.4",
diff --git a/server.ts b/server.ts
index 857d14f..d61dbba 100644
--- a/server.ts
+++ b/server.ts
@@ -26,6 +26,9 @@ import { query } from './src/lib/db';
 import { JwtPayload } from './src/lib/withAuth';
 import { EventEmitter } from 'events';
 import { telegramEventHandler } from './src/lib/telegram/TelegramEventHandler';
+// 🆕 Redis adapter imports
+import { createClient } from 'redis';
+import { createAdapter } from '@socket.io/redis-adapter';
 
 // Load environment variables for custom server (development only)
 // if (process.env.NODE_ENV !== 'production' && !process.env.JWT_SECRET) {
@@ -42,6 +45,7 @@ console.log('[Server] Environment check:', {
   NODE_ENV: process.env.NODE_ENV,
   hasJWT_SECRET: !!process.env.JWT_SECRET,
   hasDATABASE_URL: !!process.env.DATABASE_URL,
+  hasREDIS_URL: !!process.env.REDIS_URL,
   PORT: process.env.PORT || '3000'
 });
 
@@ -365,6 +369,37 @@ async function bootstrap() {
     }
   });
 
+  // 🆕 Attach Redis adapter for multi-instance support
+  const redisUrl = process.env.REDIS_URL;
+  if (redisUrl) {
+    try {
+      console.log('[Socket.IO] Setting up Redis adapter...');
+      const pubClient = createClient({ url: redisUrl });
+      const subClient = pubClient.duplicate();
+      
+      // Handle Redis connection errors
+      pubClient.on('error', (err: Error) => {
+        console.error('[Socket.IO Redis] Pub client error:', err);
+      });
+      subClient.on('error', (err: Error) => {
+        console.error('[Socket.IO Redis] Sub client error:', err);
+      });
+      
+      // Connect both clients
+      await Promise.all([pubClient.connect(), subClient.connect()]);
+      
+      // Attach the Redis adapter
+      io.adapter(createAdapter(pubClient, subClient));
+      
+      console.log('[Socket.IO] Redis adapter initialized successfully - multi-instance coordination enabled');
+    } catch (error) {
+      console.error('[Socket.IO] Failed to initialize Redis adapter:', error);
+      console.warn('[Socket.IO] Continuing without Redis adapter - single instance mode');
+    }
+  } else {
+    console.warn('[Socket.IO] REDIS_URL not provided - running without Redis adapter (single instance mode)');
+  }
+
   console.log('[Socket.IO] Server instance created with global presence system');
 
   // ===== ENHANCED EVENT SYSTEM =====
diff --git a/yarn.lock b/yarn.lock
index 1556a52..ae75b96 100644
--- a/yarn.lock
+++ b/yarn.lock
@@ -2381,6 +2381,33 @@
     react-remove-scroll "2.6.2"
     ua-parser-js "^1.0.37"
 
+"@redis/bloom@5.6.0":
+  version "5.6.0"
+  resolved "https://registry.npmjs.org/@redis/bloom/-/bloom-5.6.0.tgz#6937e2186dee99e49c258cfce2e169cb7651e08a"
+  integrity sha512-l13/d6BaZDJzogzZJEphIeZ8J0hpQpjkMiozomTm6nJiMNYkoPsNOBOOQua4QsG0fFjyPmLMDJFPAp5FBQtTXg==
+
+"@redis/client@5.6.0":
+  version "5.6.0"
+  resolved "https://registry.npmjs.org/@redis/client/-/client-5.6.0.tgz#bf2d5fb7008e3dbad3f57097d380ef7904f909cc"
+  integrity sha512-wmP9kCFElCSr4MM4+1E4VckDuN4wLtiXSM/J0rKVQppajxQhowci89RGZr2OdLualowb8SRJ/R6OjsXrn9ZNFA==
+  dependencies:
+    cluster-key-slot "1.1.2"
+
+"@redis/json@5.6.0":
+  version "5.6.0"
+  resolved "https://registry.npmjs.org/@redis/json/-/json-5.6.0.tgz#a43d6be4a8d8215e3c8dfe452d0102318bc39cad"
+  integrity sha512-YQN9ZqaSDpdLfJqwzcF4WeuJMGru/h4WsV7GeeNtXsSeyQjHTyDxrd48xXfRRJGv7HitA7zGnzdHplNeKOgrZA==
+
+"@redis/search@5.6.0":
+  version "5.6.0"
+  resolved "https://registry.npmjs.org/@redis/search/-/search-5.6.0.tgz#2b3900b2df6b19c93926051d83e88d619eb41fca"
+  integrity sha512-sLgQl92EyMVNHtri5K8Q0j2xt9c0cO9HYurXz667Un4xeUYR+B/Dw5lLG35yqO7VvVxb9amHJo9sAWumkKZYwA==
+
+"@redis/time-series@5.6.0":
+  version "5.6.0"
+  resolved "https://registry.npmjs.org/@redis/time-series/-/time-series-5.6.0.tgz#b8b56ec59a2d29ebc2471d5b6213d12df5581028"
+  integrity sha512-tXABmN1vu4aTNL3WI4Iolpvx/5jgil2Bs31ozvKblT+jkUoRkk8ykmYo9Pv/Mp7Gk6/Qkr/2rMgVminrt/4BBQ==
+
 "@reduxjs/toolkit@1.x.x || 2.x.x":
   version "2.8.2"
   resolved "https://registry.npmjs.org/@reduxjs/toolkit/-/toolkit-2.8.2.tgz"
@@ -2669,6 +2696,15 @@
   resolved "https://registry.npmjs.org/@socket.io/component-emitter/-/component-emitter-3.1.2.tgz"
   integrity sha512-9BCxFwvbGg/RsZK9tjXd8s4UcwR0MWeFQ1XEKIQVVvAGJyINdrqKMcTRyLoK8Rse1GjzLV9cwjWV1olXRWEXVA==
 
+"@socket.io/redis-adapter@^8.3.0":
+  version "8.3.0"
+  resolved "https://registry.npmjs.org/@socket.io/redis-adapter/-/redis-adapter-8.3.0.tgz#bdce1e8f34c07df4a8baf98170bf24dc84eaed4a"
+  integrity sha512-ly0cra+48hDmChxmIpnESKrc94LjRL80TEmZVscuQ/WWkRP81nNj8W8cCGMqbI4L6NCuAaPRSzZF1a9GlAxxnA==
+  dependencies:
+    debug "~4.3.1"
+    notepack.io "~3.0.1"
+    uid2 "1.0.0"
+
 "@standard-schema/spec@^1.0.0":
   version "1.0.0"
   resolved "https://registry.npmjs.org/@standard-schema/spec/-/spec-1.0.0.tgz"
@@ -4793,6 +4829,11 @@ clsx@^1.2.1:
   resolved "https://registry.npmjs.org/clsx/-/clsx-1.2.1.tgz"
   integrity sha512-EcR6r5a8bj6pu3ycsa/E/cKVGuTgZJZdsyUYHOksG/UHIiKfjxzRxYJpyVBwYaQeOvghal9fcc4PidlgzugAQg==
 
+cluster-key-slot@1.1.2:
+  version "1.1.2"
+  resolved "https://registry.npmjs.org/cluster-key-slot/-/cluster-key-slot-1.1.2.tgz#88ddaa46906e303b5de30d3153b7d9fe0a0c19ac"
+  integrity sha512-RMr0FhtfXemyinomL4hrWcYJxmX6deFdCxpJzhDttxgO1+bcCnkk+9drydLVDmAMG7NE6aN/fl4F7ucU/90gAA==
+
 color-convert@^2.0.1:
   version "2.0.1"
   resolved "https://registry.npmjs.org/color-convert/-/color-convert-2.0.1.tgz"
@@ -8466,6 +8507,11 @@ normalize-url@^6.0.1:
   resolved "https://registry.npmjs.org/normalize-url/-/normalize-url-6.1.0.tgz"
   integrity sha512-DlL+XwOy3NxAQ8xuC0okPgK46iuVNAK01YN7RueYBqqFeGsBjV9XmCAzAdgt+667bCl5kPh9EqKKDwnaPG1I7A==
 
+notepack.io@~3.0.1:
+  version "3.0.1"
+  resolved "https://registry.npmjs.org/notepack.io/-/notepack.io-3.0.1.tgz#2c2c9de1bd4e64a79d34e33c413081302a0d4019"
+  integrity sha512-TKC/8zH5pXIAMVQio2TvVDTtPRX+DJPHDqjRbxogtFiByHyzKmy96RA0JtCQJ+WouyyL4A10xomQzgbUT+1jCg==
+
 number-to-bn@1.7.0:
   version "1.7.0"
   resolved "https://registry.npmjs.org/number-to-bn/-/number-to-bn-1.7.0.tgz"
@@ -9499,6 +9545,17 @@ recharts@^3.0.2:
     use-sync-external-store "^1.2.2"
     victory-vendor "^37.0.2"
 
+redis@^5.6.0:
+  version "5.6.0"
+  resolved "https://registry.npmjs.org/redis/-/redis-5.6.0.tgz#6e75a700a15f0431df312c1a8944bd68f434287f"
+  integrity sha512-0x3pM3SlYA5azdNwO8qgfMBzoOqSqr9M+sd1hojbcn0ZDM5zsmKeMM+zpTp6LIY+mbQomIc/RTTQKuBzr8QKzQ==
+  dependencies:
+    "@redis/bloom" "5.6.0"
+    "@redis/client" "5.6.0"
+    "@redis/json" "5.6.0"
+    "@redis/search" "5.6.0"
+    "@redis/time-series" "5.6.0"
+
 redux-thunk@^3.1.0:
   version "3.1.0"
   resolved "https://registry.npmjs.org/redux-thunk/-/redux-thunk-3.1.0.tgz"
@@ -10805,6 +10862,11 @@ ufo@^1.5.4, ufo@^1.6.1:
   resolved "https://registry.npmjs.org/ufo/-/ufo-1.6.1.tgz"
   integrity sha512-9a4/uxlTWJ4+a5i0ooc1rU7C7YOw3wT+UGqdeNNHWnOF9qcMBgLRS+4IYUqbczewFx4mLEig6gawh7X6mFlEkA==
 
+uid2@1.0.0:
+  version "1.0.0"
+  resolved "https://registry.npmjs.org/uid2/-/uid2-1.0.0.tgz#ef8d95a128d7c5c44defa1a3d052eecc17a06bfb"
+  integrity sha512-+I6aJUv63YAcY9n4mQreLUt0d4lvwkkopDNmpomkAUz0fAkEMV9pRWxN0EjhW1YfRhcuyHg2v3mwddCDW1+LFQ==
+
 uint8arrays@3.1.0, uint8arrays@^3.0.0:
   version "3.1.0"
   resolved "https://registry.npmjs.org/uint8arrays/-/uint8arrays-3.1.0.tgz"
