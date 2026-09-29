# Node.js 20 LTS image (required by Baileys & sharp)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package configuration
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy all project code
COPY . .

# Expose web pairing dashboard port
EXPOSE 8080 3000

# Start VIRUZ WhatsApp bot
CMD ["node", "index.js"]
