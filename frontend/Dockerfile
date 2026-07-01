FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG PUBLIC_BACKEND_URL=http://localhost:8000
ENV PUBLIC_BACKEND_URL=$PUBLIC_BACKEND_URL
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
