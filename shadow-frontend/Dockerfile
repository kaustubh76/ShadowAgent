FROM node:20-alpine AS builder

WORKDIR /app

# Copy SDK first (local dependency)
COPY shadow-sdk/ /sdk/
WORKDIR /sdk
RUN npm ci && npm run build

# Build frontend
WORKDIR /app
COPY shadow-frontend/package.json shadow-frontend/package-lock.json ./
RUN npm ci

COPY shadow-frontend/ ./
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY shadow-frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
