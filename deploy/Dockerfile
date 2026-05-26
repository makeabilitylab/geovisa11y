# Build stage
FROM node:18-slim as build

# Set working directory
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Verify and set environment variables
ARG REACT_APP_MAPBOX_TOKEN
ENV REACT_APP_MAPBOX_TOKEN=$REACT_APP_MAPBOX_TOKEN

# Create .env file
RUN echo "REACT_APP_MAPBOX_TOKEN=$REACT_APP_MAPBOX_TOKEN" > .env

# Build the app
RUN npm run build

# Serve stage
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx config
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Create a script to inject environment variables at runtime
RUN echo "window.ENV = {};" > /usr/share/nginx/html/env-config.js

# Modify entrypoint to include environment variable injection
COPY deploy/docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

# Expose port
EXPOSE 80

# Use custom entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"] 