diff --git a/server.ts b/server.ts
index d61dbba..bf37ed9 100644
--- a/server.ts
+++ b/server.ts
@@ -542,6 +542,56 @@ async function bootstrap() {
     }
   });
 
+  // ===== CROSS-INSTANCE PRESENCE SYNC =====
+  
+  /**
+   * Merge presence results from multiple servers, handling duplicate users
+   * who may have devices connected to different instances
+   */
+  function mergePresenceResults(serverResults: EnhancedUserPresence[][]): EnhancedUserPresence[] {
+    // Flatten all results and group by userId
+    const allUsers = serverResults.flat();
+    const userMap = new Map<string, EnhancedUserPresence>();
+    
+    for (const user of allUsers) {
+      const existing = userMap.get(user.userId);
+      if (existing) {
+        // Merge devices from multiple servers for the same user
+        const combinedDevices = [...existing.devices, ...user.devices];
+        const mostRecentDevice = combinedDevices.reduce((latest, current) => 
+          current.lastSeen > latest.lastSeen ? current : latest
+        );
+        
+        userMap.set(user.userId, {
+          ...user,
+          devices: combinedDevices,
+          totalDevices: combinedDevices.length,
+          primaryDevice: mostRecentDevice,
+          lastSeen: mostRecentDevice.lastSeen
+        });
+      } else {
+        userMap.set(user.userId, user);
+      }
+    }
+    
+    return Array.from(userMap.values());
+  }
+  
+  /**
+   * Handle requests for presence data from other instances
+   * Each server responds with its local online users
+   */
+  io.on('getAllPresence', (callback) => {
+    try {
+      const localUsers = getOnlineUsers();
+      console.log(`[Socket.IO Cross-Instance] Responding to presence request with ${localUsers.length} local users`);
+      callback(localUsers);
+    } catch (error) {
+      console.error('[Socket.IO Cross-Instance] Failed to get local presence:', error);
+      callback([]);
+    }
+  });
+
   // Socket connection handling
   io.on('connection', (socket: AuthenticatedSocket) => {
     const user = socket.data.user;
@@ -604,8 +654,17 @@ async function bootstrap() {
       });
     }
     
-    // Send initial presence sync to new user
-    socket.emit('globalPresenceSync', getOnlineUsers());
+    // Send initial presence sync to new user (from ALL instances)
+    io.serverSideEmit('getAllPresence', (err: Error | null, results?: EnhancedUserPresence[][]) => {
+      if (err || !results) {
+        console.error('[Socket.IO Cross-Instance] Failed to get global presence:', err);
+        socket.emit('globalPresenceSync', getOnlineUsers()); // fallback to local
+      } else {
+        const allUsers = mergePresenceResults(results);
+        console.log(`[Socket.IO Cross-Instance] Sending ${allUsers.length} users from ${results.length} instances`);
+        socket.emit('globalPresenceSync', allUsers);
+      }
+    });
     
     console.log(`[Socket.IO Multi-Device Presence] User ${user.sub} connected with device ${frameUID} (${deviceType}). Total devices: ${devicePresence.size}`);
 
