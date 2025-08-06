# Dockerfile

# ---- Builder Stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Declare build arguments that Railway will inject from service variables
ARG NEXT_PRIVATE_PRIVKEY
ARG NEXT_PUBLIC_PUBKEY
ARG NEXT_PUBLIC_PLUGIN_BASE_URL
ARG NEXT_PUBLIC_PLUGIN_INSTANCE_URL
ARG NEXT_PUBLIC_ADMIN_ROLE_IDS
ARG NEXT_PUBLIC_SUPERADMIN_ID
ARG NEXT_PUBLIC_LUKSO_MAINNET_RPC_URL
ARG NEXT_PUBLIC_LUKSO_MAINNET_CHAIN_ID
ARG NEXT_PUBLIC_LUKSO_TESTNET_RPC_URL
ARG NEXT_PUBLIC_LUKSO_TESTNET_CHAIN_ID
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ARG NEXT_PUBLIC_COMMON_GROUND_BASE_URL
ARG NEXT_PUBLIC_IGNORED_ROLE_IDS
ARG TELEGRAM_BOT_API_TOKEN
ARG TELEGRAM_BOT_API_URL
ARG TELEGRAM_WEBHOOK_SECRET
ARG TELEGRAM_CONNECT_SECRET
ARG TELEGRAM_BOT_NAME
ARG NEXT_PUBLIC_LUKSO_IPFS_GATEWAY
ARG NEXT_PUBLIC_RSS_BASE_URL
ARG NEXT_PUBLIC_HOST_SERVICE_URL
ARG REDIS_URL
ARG STORAGE_ACCESS_KEY_ID
ARG STORAGE_SECRET_ACCESS_KEY
ARG STORAGE_BUCKET_NAME
ARG STORAGE_REGION
ARG STORAGE_ENDPOINT_URL
ARG STORAGE_PUBLIC_URL_PREFIX
ARG NEXT_PUBLIC_CHAT_BASE_URL
ARG IRC_DATABASE_URL
ARG NEXT_PUBLIC_CURIA_BASE_URL
ARG SOJU_ADMIN_API_TOKEN
ARG SOJU_SIDECAR_URL

# Copy package.json and yarn.lock first to leverage Docker cache
COPY package.json yarn.lock ./

# Install dependencies (yarn resolutions will force npm version of ethereumjs-abi)
RUN yarn install --frozen-lockfile && yarn cache clean

# Copy the rest of the application code
COPY . .

# Set Node.js memory limit to handle build process (Railway memory limit optimization)
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Run the build script (next build && tsc)
# The ARGs declared above will be available as environment variables to this command
RUN yarn build

# DEBUG: List the contents of /app/dist in the builder stage
RUN echo "Contents of /app/dist in builder stage:" && ls -R /app/dist

# ---- Production Stage ----
FROM node:20-alpine
WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy package.json and yarn.lock
COPY package.json yarn.lock ./

# Install production dependencies (yarn resolutions will force npm version of ethereumjs-abi)
RUN yarn install --production --frozen-lockfile && yarn cache clean

# Copy built artifacts from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# DEBUG: List the contents of /app/dist in the production stage
RUN echo "Contents of /app/dist in production stage:" && ls -R /app/dist

# Expose the port the app runs on (Railway will map this to $PORT)
EXPOSE 3000

# Command to run the application
# This will use the "start" script from package.json: "NODE_ENV=production node dist/server.js"
CMD ["yarn", "start"] 