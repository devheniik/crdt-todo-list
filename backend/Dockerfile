# Use Node.js 16 on Alpine Linux
FROM node:16-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the backend source code
COPY . .

# Expose the backend port
EXPOSE 3000

# Start the backend server
CMD ["npm", "run", "start-dev"]
