# Multi-stage build: Node.js for frontend build, Deno for serving
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
COPY packages/ ./packages/

RUN npm ci

# Copy source and build frontend
COPY . .
ENV NEXT_PUBLIC_SELF_HOSTED=1
RUN npm run build:self-hosted

# Deno runtime stage
FROM denoland/deno:1.44.0

# Install curl for healthcheck, unzip for model extraction
RUN apk add --no-cache curl unzip

WORKDIR /app

# Copy Deno project files
COPY deno/ ./deno/

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/out ./out

# Copy public assets
COPY --from=frontend-builder /app/public ./public

# Copy remaining project files needed by Deno
COPY package.json ./
COPY next.config.mjs ./
COPY tailwind.config.js ./
COPY jsconfig.json ./
COPY postcss.config.js ./

# Cache Deno dependencies
RUN deno cache --allow-all deno/main.ts

# Expose port
EXPOSE 8000

# Set environment variables
ENV AI_CINEMA_HOME=/data
ENV DENO_DIR=/cache
ENV AI_CINEMA_PORT=8000

# Create data directory
RUN mkdir -p /data

# Run the Deno backend (which serves both API and frontend)
CMD ["deno", "run", "--allow-all", "deno/main.ts"]
