# Dockerfile for the blog image upload MVP
FROM node:20-alpine AS builder

# Install Sharp's native dependencies on Alpine
RUN apk add --no-cache vips-dev build-base python3

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies and force Sharp rebuild for this platform
RUN npm ci --omit=dev --ignore-scripts && \
    npm rebuild sharp

# Copy source code
COPY . .

# Build the Next.js application
RUN npm run build

# Production image
FROM node:20-alpine AS runner
WORKDIR /app

# Install Sharp runtime dependency (libvips)
RUN apk add --no-cache vips

# Add a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
ENV NODE_ENV=production

# Copy necessary files from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

# Ensure the uploads directory exists and is writable
RUN mkdir -p public/images/uploads && chown -R nextjs:nodejs public

USER nextjs

# Expose the port Next.js runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
