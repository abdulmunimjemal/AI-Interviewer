# Use an official Nginx image as the base
FROM nginx:alpine

# Remove the default Nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom Nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy the static files into the nginx html directory
COPY . /usr/share/nginx/html

# Expose port 80
EXPOSE 80