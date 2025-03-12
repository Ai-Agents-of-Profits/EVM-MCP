FROM node:18-alpine AS builder

# Copy package files for dependency installation
COPY package*.json /app/
WORKDIR /app

# Install dependencies
RUN npm install

# Copy source code
COPY src/ /app/src/
COPY tsconfig.json /app/
COPY abis/ /app/abis/

# Build the application
RUN npm run build

FROM node:18-alpine AS release

WORKDIR /app

# Copy build artifacts and package files
COPY --from=builder /app/build /app/build
COPY --from=builder /app/package*.json /app/

# Copy ABI files needed at runtime
COPY abis/ /app/abis/

# Create directory for wallet keys
RUN mkdir -p /app/keys
# Note: In production, you should mount the keys directory as a volume

# Install production dependencies only
ENV NODE_ENV=production
RUN npm ci --omit=dev

# Add config file - modify as needed for your production environment
COPY config.json /app/

# Set executable permissions
RUN chmod +x /app/build/index.js

ENTRYPOINT ["node", "build/index.js"]
