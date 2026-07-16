# Dockerfile for the blog image upload MVP
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the Next.js application
RUN npm run build

# Production image
FROM node:20-alpine AS runner
WORKDIR /app

# Add a non‑root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
ENV NODE_ENV=production

# Copy only the necessary files from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Ensure the uploads directory exists and is writable
RUN mkdir -p public/images/uploads && chown -R nextjs:nodejs public/images/uploads

USER nextjs

# Expose the port Next.js runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]